//! Windows Shell classic context menu integration.
//!
//! Implements "显示更多选项" by invoking the real Windows Shell context menu
//! via the `IContextMenu` COM interface.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use windows::core::PCSTR;
use windows::core::PCWSTR;
use windows::Win32::System::Com::{
    CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::{
    CMF_NORMAL, CMINVOKECOMMANDINFO, Common, IContextMenu, IShellFolder, SHBindToParent,
    SHParseDisplayName,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreatePopupMenu, DestroyMenu, GetForegroundWindow, TrackPopupMenuEx, HMENU, TPM_LEFTALIGN,
    TPM_RETURNCMD, TPM_TOPALIGN,
};

fn wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

pub fn show_classic_context_menu(paths: &[String], x: i32, y: i32) -> Result<(), String> {
    if paths.is_empty() {
        return Err("No paths provided".into());
    }

    let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let we_initialized = hr.is_ok();

    let result = show_menu_inner(&paths[0], x, y);

    if we_initialized {
        unsafe { CoUninitialize() };
    }

    result
}

fn show_menu_inner(first_path: &str, x: i32, y: i32) -> Result<(), String> {
    let path = Path::new(first_path);
    let wide_path = wide(&path.to_string_lossy());

    // 1. Parse path → absolute PIDL.
    let mut pidl: *mut Common::ITEMIDLIST = std::ptr::null_mut();
    unsafe {
        SHParseDisplayName(PCWSTR(wide_path.as_ptr()), None, &mut pidl, 0, None)
            .map_err(|e| format!("SHParseDisplayName failed: {:?}", e))?;
    }
    if pidl.is_null() {
        return Err("SHParseDisplayName returned null PIDL".into());
    }

    // 2. Bind to parent IShellFolder + get child PIDL.
    //    SHBindToParent<T>(pidl, child_pidl_out) → Result<T>.
    let mut child_pidl: *mut Common::ITEMIDLIST = std::ptr::null_mut();
    let parent_folder = unsafe {
        SHBindToParent::<IShellFolder>(pidl, Some(&mut child_pidl))
            .map_err(|e| {
                // Free the full PIDL before returning.
                CoTaskMemFree(Some(pidl as *const _));
                format!("SHBindToParent failed: {:?}", e)
            })?
    };

    // Free the full PIDL — we only need the child PIDL from here on.
    unsafe { CoTaskMemFree(Some(pidl as *const _)) };

    // 3. Get IContextMenu from parent folder for the child item.
    let child_pidls: [*const Common::ITEMIDLIST; 1] = [child_pidl];
    let context_menu: IContextMenu = unsafe {
        parent_folder
            .GetUIObjectOf(None, &child_pidls, None)
            .map_err(|e| {
                // Free the child PIDL on error to avoid a resource leak.
                unsafe { CoTaskMemFree(Some(child_pidl as *const _)) };
                format!("GetUIObjectOf failed: {:?}", e)
            })?
    };

    // 4. Build popup menu via QueryContextMenu.
    let hmenu: HMENU = unsafe { CreatePopupMenu() }
        .map_err(|e| {
            unsafe { CoTaskMemFree(Some(child_pidl as *const _)) };
            format!("CreatePopupMenu failed: {:?}", e)
        })?;

    unsafe {
        context_menu
            .QueryContextMenu(hmenu, 0, 0, 0x7FFF, CMF_NORMAL)
            .map_err(|e| {
                let _ = DestroyMenu(hmenu);
                unsafe { CoTaskMemFree(Some(child_pidl as *const _)) };
                format!("QueryContextMenu failed: {:?}", e)
            })?;
    }

    // 5. Show menu (blocks until selection or cancel).
    let hwnd = unsafe { GetForegroundWindow() };
    let flags = TPM_LEFTALIGN.0 | TPM_TOPALIGN.0 | TPM_RETURNCMD.0;
    let cmd = unsafe { TrackPopupMenuEx(hmenu, flags, x, y, hwnd, None) };

    // 6. Invoke selected command.
    if cmd.0 > 0 {
        // lpVerb is MAKEINTRESOURCE(cmd) — the integer command offset cast
        // to a pointer. Since idCmdFirst was 0, the offset equals cmd.
        let info = CMINVOKECOMMANDINFO {
            cbSize: std::mem::size_of::<CMINVOKECOMMANDINFO>() as u32,
            fMask: 0,
            hwnd,
            lpVerb: PCSTR(cmd.0 as usize as *const u8),
            lpParameters: PCSTR::null(),
            lpDirectory: PCSTR::null(),
            nShow: 1, // SW_SHOWNORMAL
            dwHotKey: 0,
            hIcon: Default::default(),
        };
        let _ = unsafe { context_menu.InvokeCommand(&info) };
    }

    // 7. Cleanup: free the child PIDL and destroy the menu.
    unsafe {
        CoTaskMemFree(Some(child_pidl as *const _));
        let _ = DestroyMenu(hmenu);
    }
    Ok(())
}
