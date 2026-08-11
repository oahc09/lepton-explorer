//! Windows Shell classic context menu integration.
//!
//! Implements "显示更多选项" by invoking the real Windows Shell context menu
//! via the `IContextMenu` COM interface.
//!
//! ## Why a child process?
//!
//! The Shell classic menu loads third-party *shell extensions* (7-Zip,
//! anti-virus, cloud-drive, GPU control panels, etc.). Some of them trigger a
//! native **access violation** inside `IContextMenu::InvokeCommand`. That is an
//! OS-level fault — Rust's panic hook cannot catch it, and it terminates the
//! whole process. To keep the main application alive no matter what an
//! extension does, the menu is hosted in a *separate child process* (a second
//! copy of this same executable, launched with the `--lepton-shell-host`
//! sentinel). If the child crashes, only the child dies; the file manager
//! keeps running.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::process;

use windows::core::PCSTR;
use windows::core::PCWSTR;
use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::System::Ole::{OleInitialize, OleUninitialize};
use windows::Win32::UI::Shell::{
    CMF_NORMAL, CMINVOKECOMMANDINFO, Common, IContextMenu, IShellFolder, SHBindToParent,
    SHParseDisplayName,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreatePopupMenu, DestroyMenu, GetForegroundWindow, SetForegroundWindow, TrackPopupMenuEx,
    HMENU, TPM_LEFTALIGN, TPM_RETURNCMD, TPM_TOPALIGN,
};

/// Command-line sentinel: when present, this process is a transient menu host
/// rather than the file-manager application.
const SHELL_HOST_ARG: &str = "--lepton-shell-host";

fn wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

/// Called at the very start of `run()`. If this process was launched as a
/// shell-menu host (sentinel arg present), it runs the menu and exits — never
/// reaching Tauri. Returns `true` when it handled the invocation (so the caller
/// knows not to continue booting the app).
pub fn run_shell_host_if_invoked() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if let Some(pos) = args.iter().position(|a| a == SHELL_HOST_ARG) {
        let rest = &args[pos + 1..];
        let (x, y, paths): (i32, i32, Vec<String>) = if rest.len() >= 3 {
            let x = rest[0].parse().unwrap_or(0);
            let y = rest[1].parse().unwrap_or(0);
            (x, y, rest[2..].to_vec())
        } else {
            (0, 0, Vec::new())
        };

        let res = if paths.is_empty() {
            Err("No paths provided".to_string())
        } else {
            run_menu_isolated(&paths[0], x, y)
        };

        // Exit with a stable code so the parent can report failure.
        std::process::exit(match res {
            Ok(()) => 0,
            Err(_) => 1,
        });
    }
    false
}

/// Spawn a child copy of this executable to host the classic context menu.
/// Isolating the Shell COM calls in a separate process means a crash inside a
/// shell extension can never take down the main application.
pub fn show_classic_context_menu(paths: &[String], x: i32, y: i32) -> Result<(), String> {
    if paths.is_empty() {
        return Err("No paths provided".into());
    }

    let exe = std::env::current_exe().map_err(|e| format!("无法定位自身可执行文件：{e}"))?;

    let mut cmd = process::Command::new(exe);
    cmd.arg(SHELL_HOST_ARG).arg(x.to_string()).arg(y.to_string());
    for p in paths {
        cmd.arg(p);
    }

    let status = cmd
        .status()
        .map_err(|e| format!("启动上下文菜单子进程失败：{e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "上下文菜单子进程异常退出 (code {})",
            status.code().unwrap_or(-1)
        ))
    }
}

/// Run the menu on a dedicated STA thread inside the (child) process.
fn run_menu_isolated(first_path: &str, x: i32, y: i32) -> Result<(), String> {
    unsafe {
        // The Shell classic context menu and many of its extensions rely on
        // OLE (not just COM). Running them without OleInitialize causes access
        // violations in shell extensions.
        let hr = OleInitialize(None);
        let initialized = hr.is_ok();
        let res = show_menu_inner(first_path, x, y);
        if initialized {
            OleUninitialize();
        }
        res
    }
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
    let mut child_pidl: *mut Common::ITEMIDLIST = std::ptr::null_mut();
    let parent_folder = unsafe {
        SHBindToParent::<IShellFolder>(pidl, Some(&mut child_pidl)).map_err(|e| {
            CoTaskMemFree(Some(pidl as *const _));
            format!("SHBindToParent failed: {:?}", e)
        })?
    };

    // Free the full PIDL — we only need the child PIDL from here on.
    unsafe { CoTaskMemFree(Some(pidl as *const _)) };

    // 3. Get IContextMenu from parent folder for the child item.
    let child_pidls: [*const Common::ITEMIDLIST; 1] = [child_pidl];
    let context_menu: IContextMenu = unsafe {
        parent_folder.GetUIObjectOf(None, &child_pidls, None).map_err(|e| {
            CoTaskMemFree(Some(child_pidl as *const _));
            format!("GetUIObjectOf failed: {:?}", e)
        })?
    };

    // 4. Build popup menu via QueryContextMenu.
    let hmenu: HMENU = unsafe { CreatePopupMenu() }.map_err(|e| {
        unsafe { CoTaskMemFree(Some(child_pidl as *const _)) };
        format!("CreatePopupMenu failed: {:?}", e)
    })?;

    unsafe {
        context_menu
            .QueryContextMenu(hmenu, 0, 0, 0x7FFF, CMF_NORMAL)
            .map_err(|e| {
                let _ = DestroyMenu(hmenu);
                CoTaskMemFree(Some(child_pidl as *const _));
                format!("QueryContextMenu failed: {:?}", e)
            })?;
    }

    // 5. Show menu (blocks until selection or cancel).
    //
    // `TrackPopupMenuEx` must be called from a thread that owns the foreground,
    // otherwise Windows may refuse to display the menu. Re-assert foreground on
    // the current foreground window before showing.
    let hwnd = unsafe { GetForegroundWindow() };
    unsafe {
        let _ = SetForegroundWindow(hwnd);
    }
    let flags = TPM_LEFTALIGN.0 | TPM_TOPALIGN.0 | TPM_RETURNCMD.0;
    let cmd = unsafe { TrackPopupMenuEx(hmenu, flags, x, y, hwnd, None) };

    // 6. Invoke selected command.
    if cmd.0 > 0 {
        // lpVerb is MAKEINTRESOURCE(cmd) — the integer command offset cast to a
        // pointer. Since idCmdFirst was 0, the offset equals cmd.
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
