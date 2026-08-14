//! Native OS file/folder drag (drag-and-drop OUT to other applications).
//!
//! The webview's HTML5 drag-and-drop can only carry `text/plain`, which Windows
//! Explorer / desktop / other apps do not recognize as files. To let the user
//! drag an item from Lepton onto any other program we must start a real Win32
//! `DoDragDrop` with a shell data object that exposes `CF_HDROP`.
//!
//! The frontend detects the drag gesture with pointer events and calls
//! `start_os_drag`, which builds an `IDataObject` (carrying `CF_HDROP`) plus a
//! minimal `IDropSource`, then blocks the main thread inside `DoDragDrop` (the
//! main thread owns the message pump, so the modal drag loop is correct here).
//! Dropping onto our own window still works: WebView2 fires native drop events
//! and the frontend reads the source paths from its own in-memory `dragged`
//! store, so in-app move/copy is preserved.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

use windows::core::Interface;
use windows::core::{HRESULT, IUnknown_Vtbl};
use windows::Win32::Foundation::{BOOL, GlobalFree, HGLOBAL, POINT};
use windows::Win32::System::Com::{
    FORMATETC, IDataObject, IDataObject_Vtbl, STGMEDIUM,
};
use windows::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};
use windows::Win32::System::Ole::{DROPEFFECT, DoDragDrop, IDropSource, IDropSource_Vtbl};
use windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS;
use windows::Win32::UI::Shell::DROPFILES;

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

const S_OK: HRESULT = HRESULT(0);
const E_NOTIMPL: HRESULT = HRESULT(0x8000_4001u32 as i32);
const E_NOINTERFACE: HRESULT = HRESULT(0x8000_4002u32 as i32);
const E_INVALIDARG: HRESULT = HRESULT(0x8007_0057u32 as i32);
const DRAGDROP_S_CANCEL: HRESULT = HRESULT(0x0004_0101);
const DRAGDROP_S_USEDEFAULTCURSORS: HRESULT = HRESULT(0x0004_0102);

#[repr(C)]
struct DataState {
    vtbl: *const IDataObject_Vtbl,
    refs: u32,
    hdrop: HGLOBAL,
}

#[repr(C)]
struct DropState {
    vtbl: *const IDropSource_Vtbl,
    refs: u32,
}

// ---- refcount helpers ----

unsafe extern "system" fn data_add_ref(this: *mut std::ffi::c_void) -> u32 {
    let s = &mut *(this as *mut DataState);
    s.refs += 1;
    s.refs
}

unsafe extern "system" fn data_release(this: *mut std::ffi::c_void) -> u32 {
    let s = &mut *(this as *mut DataState);
    s.refs -= 1;
    if s.refs == 0 {
        let _ = GlobalFree(s.hdrop);
        drop(Box::from_raw(this as *mut DataState));
        return 0;
    }
    s.refs
}

unsafe extern "system" fn drop_add_ref(this: *mut std::ffi::c_void) -> u32 {
    let s = &mut *(this as *mut DropState);
    s.refs += 1;
    s.refs
}

unsafe extern "system" fn drop_release(this: *mut std::ffi::c_void) -> u32 {
    let s = &mut *(this as *mut DropState);
    s.refs -= 1;
    if s.refs == 0 {
        drop(Box::from_raw(this as *mut DropState));
        return 0;
    }
    s.refs
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
    let copy = dup_hglobal(s.hdrop);
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

unsafe extern "system" fn data_d_unadvise(_this: *mut std::ffi::c_void, _dw_connection: u32) -> HRESULT {
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
        // Button released -> drop.
        return S_OK;
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
fn build_hdrop(paths: &[String]) -> HGLOBAL {
    let mut wides: Vec<Vec<u16>> = Vec::with_capacity(paths.len());
    let mut total: usize = 0;
    for p in paths {
        let w: Vec<u16> = OsStr::new(p).encode_wide().chain(std::iter::once(0u16)).collect();
        total += w.len() * 2;
        wides.push(w);
    }
    total += 2; // terminating double-NUL

    let size = std::mem::size_of::<DROPFILES>() + total;
    let h = unsafe { GlobalAlloc(GMEM_MOVEABLE, size) }.expect("GlobalAlloc for HDROP failed");
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
    h
}

/// Duplicate an `HGLOBAL` (caller owns the copy).
fn dup_hglobal(h: HGLOBAL) -> HGLOBAL {
    let size = unsafe { GlobalSize(h) };
    let copy = unsafe { GlobalAlloc(GMEM_MOVEABLE, size) }.expect("GlobalAlloc duplicate failed");
    unsafe {
        let src = GlobalLock(h);
        let dst = GlobalLock(copy);
        std::ptr::copy_nonoverlapping(src as *const u8, dst as *mut u8, size);
        let _ = GlobalUnlock(h);
        let _ = GlobalUnlock(copy);
    }
    copy
}

/// Start a native OS drag carrying the given paths as `CF_HDROP`. Must be invoked
/// on the main (UI) thread so `DoDragDrop`'s modal message loop can run.
#[tauri::command]
pub fn start_os_drag(paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Err("没有可拖拽的项目".into());
    }
    unsafe {
        let hdrop = build_hdrop(&paths);
        let drop = Box::into_raw(Box::new(DropState {
            vtbl: &DROP_VTBL,
            refs: 1,
        }));
        let data = Box::into_raw(Box::new(DataState {
            vtbl: &DATA_VTBL,
            refs: 1,
            hdrop,
        }));

        let data_obj = IDataObject::from_raw(data as *mut std::ffi::c_void);
        let drop_src = IDropSource::from_raw(drop as *mut std::ffi::c_void);

        let mut effect = DROPEFFECT(0);
        let _ = DoDragDrop(&data_obj, &drop_src, DROPEFFECT(1 | 2), &mut effect);
        // `data_obj` / `drop_src` drop here, calling Release -> frees both states.
    }
    Ok(())
}
