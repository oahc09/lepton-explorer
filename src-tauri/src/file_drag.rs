//! Native OS file/folder drag (drag-and-drop OUT to other applications).
//!
//! The webview's HTML5 drag-and-drop can only carry `text/plain`, which Windows
//! Explorer / desktop / other apps do not recognize as files. To let the user
//! drag an item from Lepton onto any other program we must start a real Win32
//! `DoDragDrop` with a shell data object that exposes `CF_HDROP`.
//!
//! Two things make this work against *external* processes (e.g. Beyond Compare):
//!
//! 1. `DoDragDrop` MUST run on the **main thread** (the foreground thread with
//!    a message pump). It is a modal loop that relies on mouse-move/button-up
//!    messages; on a background thread it blocks forever waiting for input it
//!    never receives. Tauri commands run on the async runtime's worker threads,
//!    so `start_os_drag` hops onto the main thread via `run_on_main_thread`.
//!
//! 2. The custom `IDataObject` must be marshallable into the drop target's
//!    process. We aggregate the system's Free-Threaded Marshaler (FTM) so OLE can
//!    hand a working `IDataObject` proxy to the target process; without this, the
//!    target's `GetData(CF_HDROP)` fails and nothing is dropped.
//!
//! Dropping onto our own window still works: WebView2 fires native drop events
//! and the frontend reads the source paths from its own in-memory `dragged`
//! store, so in-app move/copy is preserved.

use std::ffi::OsStr;
use std::fs::OpenOptions;
use std::io::Write;
use std::os::windows::ffi::OsStrExt;

use windows::core::Interface;
use windows::core::{HRESULT, IUnknown, IUnknown_Vtbl};
use windows::Win32::Foundation::{BOOL, GlobalFree, HGLOBAL, POINT};
use windows::Win32::System::Com::{
    CoCreateFreeThreadedMarshaler, FORMATETC, IDataObject, IDataObject_Vtbl, STGMEDIUM,
};
use windows::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};
use windows::Win32::System::Ole::{
    DROPEFFECT, DoDragDrop, IDropSource, IDropSource_Vtbl, OleInitialize, OleUninitialize,
};
use windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS;
use windows::Win32::UI::Shell::DROPFILES;

/// Diagnostic trace -> %LOCALAPPDATA%/com.lepton.explorer/logs/os-drag-trace.log
///
/// Lets us see (from a user repro) whether `start_os_drag` was reached, what
/// `OleInitialize` returned, and exactly what HRESULT `DoDragDrop` returned —
/// including "successful" ones like `DRAGDROP_S_CANCEL` that mean the OS drag
/// never actually started (which looks like "nothing happened" from the UI).
fn trace(step: &str, detail: &str) {
    let base = dirs::data_local_dir().unwrap_or_else(|| std::env::temp_dir());
    let dir = base.join("com.lepton.explorer").join("logs");
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("os-drag-trace.log"))
    {
        let _ = writeln!(
            f,
            "[{}] {} | {}",
            chrono::Local::now().format("%H:%M:%S%.3f"),
            step,
            detail
        );
    }
}

/// `CF_HDROP` clipboard format id (== 15).
const CF_HDROP: u16 = 15;
/// `TYMED_HGLOBAL` raw value (== 1) used for `FORMATETC.tymed` / `STGMEDIUM.tymed`.
const TYMED_HGLOBAL: u32 = 1;
/// Left mouse button state mask used by `IDropSource::QueryContinueDrag`.
const MK_LBUTTON: u32 = 0x0001;

const IID_IUNKNOWN: windows::core::GUID =
    windows::core::GUID::from_u128(0x0000_0000_0000_0000_c000_0000_0000_0046);
const IID_IDATAOBJECT: windows::core::GUID =
    windows::core::GUID::from_u128(0x0000_010e_0000_0000_c000_0000_0000_0046);
const IID_IMARSHAL: windows::core::GUID =
    windows::core::GUID::from_u128(0x0000_0003_0000_0000_c000_0000_0000_0046);

const S_OK: HRESULT = HRESULT(0);
const E_NOTIMPL: HRESULT = HRESULT(0x8000_4001u32 as i32);
const E_NOINTERFACE: HRESULT = HRESULT(0x8000_4002u32 as i32);
const E_INVALIDARG: HRESULT = HRESULT(0x8007_0057u32 as i32);
const E_OUTOFMEMORY: HRESULT = HRESULT(0x8007_000eu32 as i32);
const DRAGDROP_S_CANCEL: HRESULT = HRESULT(0x0004_0101);
const DRAGDROP_S_DROP: HRESULT = HRESULT(0x0004_0100);
const DRAGDROP_S_USEDEFAULTCURSORS: HRESULT = HRESULT(0x0004_0102);

#[repr(C)]
struct DataState {
    vtbl: *const IDataObject_Vtbl,
    refs: i32,
    hdrop: HGLOBAL,
    /// Aggregated Free-Threaded Marshaler (raw `IUnknown*`). Enables the data
    /// object to be marshalled across process/apartment boundaries so external
    /// drop targets (Explorer, Beyond Compare, ...) can read `CF_HDROP`.
    marshaler: *mut std::ffi::c_void,
}

#[repr(C)]
struct DropState {
    vtbl: *const IDropSource_Vtbl,
    refs: i32,
}

// ---- refcount helpers ----

unsafe extern "system" fn data_add_ref(this: *mut std::ffi::c_void) -> u32 {
    let s = &mut *(this as *mut DataState);
    s.refs += 1;
    s.refs as u32
}

unsafe extern "system" fn data_release(this: *mut std::ffi::c_void) -> u32 {
    let s = &mut *(this as *mut DataState);
    s.refs -= 1;
    if s.refs == 0 {
        // Release the aggregated FTM first. The FTM's own Release delegates to our
        // IUnknown::Release, which re-enters this function with refs already 0;
        // because refs is an i32 it simply goes negative and we do not free twice.
        if !s.marshaler.is_null() {
            let m = s.marshaler;
            s.marshaler = std::ptr::null_mut();
            // Call Release through the vtable (avoids trait-method resolution quirks).
            let vtbl = *(m as *mut *mut IUnknown_Vtbl);
            let _ = ((*vtbl).Release)(m);
        }
        let _ = GlobalFree(s.hdrop);
        drop(Box::from_raw(this as *mut DataState));
        return 0;
    }
    s.refs as u32
}

unsafe extern "system" fn drop_add_ref(this: *mut std::ffi::c_void) -> u32 {
    let s = &mut *(this as *mut DropState);
    s.refs += 1;
    s.refs as u32
}

unsafe extern "system" fn drop_release(this: *mut std::ffi::c_void) -> u32 {
    let s = &mut *(this as *mut DropState);
    s.refs -= 1;
    if s.refs == 0 {
        drop(Box::from_raw(this as *mut DropState));
        return 0;
    }
    s.refs as u32
}

// ---- IUnknown / IDataObject ----

unsafe extern "system" fn data_query_interface(
    this: *mut std::ffi::c_void,
    iid: *const windows::core::GUID,
    ppv: *mut *mut std::ffi::c_void,
) -> HRESULT {
    let s = &*(this as *mut DataState);
    let riid = &*iid;
    let ptr = if *riid == IID_IUNKNOWN || *riid == IID_IDATAOBJECT {
        &s.vtbl as *const *const IDataObject_Vtbl as *mut std::ffi::c_void
    } else if *riid == IID_IMARSHAL && !s.marshaler.is_null() {
        // Delegate IMarshal to the aggregated Free-Threaded Marshaler.
        let vtbl = *(s.marshaler as *mut *mut IUnknown_Vtbl);
        return ((*vtbl).QueryInterface)(s.marshaler, iid, ppv);
    } else {
        *ppv = std::ptr::null_mut();
        return E_NOINTERFACE;
    };
    *ppv = ptr;
    data_add_ref(this);
    S_OK
}

unsafe extern "system" fn data_get_data(
    this: *mut std::ffi::c_void,
    pformatetc_in: *const FORMATETC,
    pmedium: *mut STGMEDIUM,
) -> HRESULT {
    let s = &*(this as *mut DataState);
    let fmt = &*pformatetc_in;
    if fmt.cfFormat != CF_HDROP || fmt.tymed != TYMED_HGLOBAL {
        return E_INVALIDARG;
    }
    let copy = match dup_hglobal(s.hdrop) {
        Ok(c) => c,
        Err(_) => return E_OUTOFMEMORY,
    };
    let mut medium: STGMEDIUM = std::mem::zeroed();
    medium.tymed = TYMED_HGLOBAL;
    medium.u.hGlobal = copy;
    *pmedium = medium;
    S_OK
}

unsafe extern "system" fn data_get_data_here(
    _this: *mut std::ffi::c_void,
    _pformatetc_in: *const FORMATETC,
    _pmedium: *mut STGMEDIUM,
) -> HRESULT {
    E_NOTIMPL
}

unsafe extern "system" fn data_query_get_data(
    _this: *mut std::ffi::c_void,
    pformatetc_in: *const FORMATETC,
) -> HRESULT {
    let fmt = &*pformatetc_in;
    if fmt.cfFormat == CF_HDROP && fmt.tymed == TYMED_HGLOBAL {
        S_OK
    } else {
        E_INVALIDARG
    }
}

unsafe extern "system" fn data_get_canonical_format_etc(
    _this: *mut std::ffi::c_void,
    _pformatetc_in: *const FORMATETC,
    pformatetc_out: *mut FORMATETC,
) -> HRESULT {
    *pformatetc_out = std::mem::zeroed();
    E_NOTIMPL
}

unsafe extern "system" fn data_set_data(
    _this: *mut std::ffi::c_void,
    _pformatetc: *const FORMATETC,
    _pmedium: *const STGMEDIUM,
    _f_release: BOOL,
) -> HRESULT {
    E_NOTIMPL
}

unsafe extern "system" fn data_enum_format_etc(
    _this: *mut std::ffi::c_void,
    _dw_direction: u32,
    ppenum_format_etc: *mut *mut std::ffi::c_void,
) -> HRESULT {
    *ppenum_format_etc = std::ptr::null_mut();
    E_NOTIMPL
}

unsafe extern "system" fn data_d_advise(
    _this: *mut std::ffi::c_void,
    _pformatetc: *const FORMATETC,
    _advf: u32,
    _p_adv_sink: *mut std::ffi::c_void,
    pdw_connection: *mut u32,
) -> HRESULT {
    *pdw_connection = 0;
    E_NOTIMPL
}

unsafe extern "system" fn data_d_unadvise(
    _this: *mut std::ffi::c_void,
    _dw_connection: u32,
) -> HRESULT {
    E_NOTIMPL
}

unsafe extern "system" fn data_enum_d_advise(
    _this: *mut std::ffi::c_void,
    ppenum_advise: *mut *mut std::ffi::c_void,
) -> HRESULT {
    *ppenum_advise = std::ptr::null_mut();
    E_NOTIMPL
}

// ---- IDropSource ----

unsafe extern "system" fn drop_query_interface(
    this: *mut std::ffi::c_void,
    iid: *const windows::core::GUID,
    ppv: *mut *mut std::ffi::c_void,
) -> HRESULT {
    let s = &*(this as *mut DropState);
    let riid = &*iid;
    let ptr = if *riid == IID_IUNKNOWN {
        &s.vtbl as *const *const IDropSource_Vtbl as *mut std::ffi::c_void
    } else {
        *ppv = std::ptr::null_mut();
        return E_NOINTERFACE;
    };
    *ppv = ptr;
    drop_add_ref(this);
    S_OK
}

unsafe extern "system" fn drop_query_continue(
    _this: *mut std::ffi::c_void,
    f_escape_pressed: BOOL,
    grf_key_state: MODIFIERKEYS_FLAGS,
) -> HRESULT {
    if f_escape_pressed.as_bool() {
        return DRAGDROP_S_CANCEL;
    }
    if (grf_key_state.0 & MK_LBUTTON) == 0 {
        // Button released -> perform the drop now.
        return DRAGDROP_S_DROP;
    }
    S_OK
}

unsafe extern "system" fn drop_give_feedback(
    _this: *mut std::ffi::c_void,
    _dw_effect: DROPEFFECT,
) -> HRESULT {
    DRAGDROP_S_USEDEFAULTCURSORS
}

static DATA_VTBL: IDataObject_Vtbl = IDataObject_Vtbl {
    base__: IUnknown_Vtbl {
        QueryInterface: data_query_interface,
        AddRef: data_add_ref,
        Release: data_release,
    },
    // With `Win32_Graphics_Gdi` + `Win32_System_Com_StructuredStorage` enabled these
    // are real function-pointer slots.
    GetData: data_get_data,
    GetDataHere: data_get_data_here,
    QueryGetData: data_query_get_data,
    GetCanonicalFormatEtc: data_get_canonical_format_etc,
    SetData: data_set_data,
    EnumFormatEtc: data_enum_format_etc,
    DAdvise: data_d_advise,
    DUnadvise: data_d_unadvise,
    EnumDAdvise: data_enum_d_advise,
};

static DROP_VTBL: IDropSource_Vtbl = IDropSource_Vtbl {
    base__: IUnknown_Vtbl {
        QueryInterface: drop_query_interface,
        AddRef: drop_add_ref,
        Release: drop_release,
    },
    // With `Win32_System_SystemServices` enabled this is a real function-pointer slot.
    QueryContinueDrag: drop_query_continue,
    GiveFeedback: drop_give_feedback,
};

/// Build an `HDROP` global memory block containing the given paths (Unicode),
/// suitable for a `CF_HDROP` `STGMEDIUM`.
fn build_hdrop(paths: &[String]) -> Result<HGLOBAL, String> {
    let mut wides: Vec<Vec<u16>> = Vec::with_capacity(paths.len());
    let mut total: usize = 0;
    for p in paths {
        let w: Vec<u16> = OsStr::new(p)
            .encode_wide()
            .chain(std::iter::once(0u16))
            .collect();
        total += w.len() * 2;
        wides.push(w);
    }
    total += 2; // terminating double-NUL

    let size = std::mem::size_of::<DROPFILES>() + total;
    let h = unsafe { GlobalAlloc(GMEM_MOVEABLE, size) }
        .map_err(|_| "分配 HDROP 内存失败".to_string())?;
    unsafe {
        let ptr = GlobalLock(h) as *mut u8;
        let df = ptr as *mut DROPFILES;
        (*df).pFiles = std::mem::size_of::<DROPFILES>() as u32;
        (*df).pt = POINT { x: 0, y: 0 };
        (*df).fNC = BOOL(0);
        (*df).fWide = BOOL(1);
        let mut off = std::mem::size_of::<DROPFILES>();
        for w in &wides {
            std::ptr::copy_nonoverlapping(w.as_ptr() as *const u8, ptr.add(off), w.len() * 2);
            off += w.len() * 2;
        }
        std::ptr::write_bytes(ptr.add(off), 0u8, 2);
        let _ = GlobalUnlock(h);
    }
    Ok(h)
}

/// Duplicate an `HGLOBAL` (caller owns the copy).
fn dup_hglobal(h: HGLOBAL) -> Result<HGLOBAL, String> {
    let size = unsafe { GlobalSize(h) };
    let copy = unsafe { GlobalAlloc(GMEM_MOVEABLE, size) }
        .map_err(|_| "复制 HDROP 内存失败".to_string())?;
    unsafe {
        let src = GlobalLock(h);
        let dst = GlobalLock(copy);
        std::ptr::copy_nonoverlapping(src as *const u8, dst as *mut u8, size);
        let _ = GlobalUnlock(h);
        let _ = GlobalUnlock(copy);
    }
    Ok(copy)
}

/// Start a native OS drag carrying the given paths as `CF_HDROP`.
///
/// `DoDragDrop` MUST run on the main thread: it is a modal loop that needs the
/// foreground thread's message pump to receive mouse-move/button-up events.
/// Running it on a background thread (as we tried before) makes it block forever
/// waiting for input it never receives. Tauri commands run on the async runtime's
/// worker threads, so we hop onto the main thread via `run_on_main_thread` and
/// wait for the drag to finish with a channel.
#[tauri::command]
pub async fn start_os_drag(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Err("没有可拖拽的项目".into());
    }
    trace("enter", &format!("paths={} first={}", paths.len(), paths[0]));

    let paths_for_main = paths.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        app.run_on_main_thread(move || {
            let result = run_drag_on_main_thread(&paths_for_main);
            let _ = tx.send(result);
        })
        .map_err(|e| format!("无法调度拖拽到主线程：{e}"))?;
        rx.recv().map_err(|e| format!("等待拖拽结果失败：{e}"))?
    })
    .await
    .map_err(|e| format!("拖拽任务执行失败：{e}"))?
}

/// Run `DoDragDrop` on the *current* (main) thread and block until the drag ends.
fn run_drag_on_main_thread(paths: &[String]) -> Result<(), String> {
    unsafe {
        // DoDragDrop is an OLE drag-drop API: the calling thread MUST be
        // initialized with OleInitialize (NOT just CoInitializeEx(STA)). The main
        // thread may already be initialized — S_FALSE is fine too.
        let ole = OleInitialize(None);
        trace("ole", &format!("OleInitialize={ole:?}"));

        let hdrop = match build_hdrop(paths) {
            Ok(h) => h,
            Err(e) => {
                OleUninitialize();
                return Err(e);
            }
        };
        let drop = Box::into_raw(Box::new(DropState {
            vtbl: &DROP_VTBL,
            refs: 1,
        }));
        let data = Box::into_raw(Box::new(DataState {
            vtbl: &DATA_VTBL,
            refs: 1,
            hdrop,
            marshaler: std::ptr::null_mut(),
        }));

        // Aggregate the Free-Threaded Marshaler so the data object can be
        // marshalled into another process (e.g. Beyond Compare).
        let outer = IUnknown::from_raw(data as *mut std::ffi::c_void);
        if let Ok(m) = CoCreateFreeThreadedMarshaler(&outer) {
            // Move the raw pointer out of `m` without running its destructor
            // (which would otherwise Release our data object).
            let raw = std::mem::transmute::<IUnknown, *mut std::ffi::c_void>(m);
            (*data).marshaler = raw;
        }
        // `outer` was created with from_raw; forget it so its destructor does
        // not Release our data object (the FTM does not hold a ref either).
        std::mem::forget(outer);

        let data_obj = IDataObject::from_raw(data as *mut std::ffi::c_void);
        let drop_src = IDropSource::from_raw(drop as *mut std::ffi::c_void);

        let mut effect = DROPEFFECT(0);
        trace("dodragdrop", "calling DoDragDrop (main thread)");
        let hr = DoDragDrop(&data_obj, &drop_src, DROPEFFECT(1 | 2), &mut effect);
        trace(
            "dodragdrop",
            &format!("returned hr=0x{:08x} effect={}", hr.0 as u32, effect.0),
        );

        // Release our data object / drop source before uninitializing OLE.
        std::mem::drop(data_obj);
        std::mem::drop(drop_src);
        OleUninitialize();

        if hr.is_err() {
            return Err(format!("DoDragDrop 失败：0x{:08x}", hr.0 as u32));
        }
        Ok(())
    }
}
