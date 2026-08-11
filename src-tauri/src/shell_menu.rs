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
//!
//! ## Why the child owns its own window
//!
//! `TrackPopupMenuEx` must be shown with an owner window that lives on the
//! *same thread* as the call, and the showing process must be (or be allowed
//! to become) the foreground process. In an earlier version we passed the
//! parent's window as the owner — but the parent is a *different process*
//! whose thread is blocked waiting on the child, so Windows refused to paint
//! the menu and nothing appeared. The child now creates its own invisible
//! owner window on its own thread and attaches its input to the foreground
//! thread (the documented workaround for showing a popup from a non-foreground
//! helper), which makes the menu display reliably.

use std::ffi::OsStr;
use std::fs::OpenOptions;
use std::io::Write;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::process;

use windows::core::PCSTR;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Ole::{OleInitialize, OleUninitialize};
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::Shell::{
    CMF_NORMAL, CMINVOKECOMMANDINFO, Common, IContextMenu, IShellFolder, SHBindToParent,
    SHParseDisplayName,
};
use windows::Win32::Graphics::Gdi::{GetDC, GetDeviceCaps, LOGPIXELSX, ReleaseDC};
use windows::Win32::UI::WindowsAndMessaging::{
    CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DestroyWindow,
    GetForegroundWindow, GetWindowThreadProcessId, RegisterClassW, SetForegroundWindow,
    TrackPopupMenuEx, CS_HREDRAW, CS_VREDRAW, HMENU, TPM_LEFTALIGN, TPM_RETURNCMD, TPM_TOPALIGN,
    WNDCLASSW, WS_OVERLAPPED,
};

/// Command-line sentinel: when present, this process is a transient menu host
/// rather than the file-manager application.
const SHELL_HOST_ARG: &str = "--lepton-shell-host";

/// Window class name for the invisible owner window the child creates.
const OWNER_CLASS: &str = "LeptonShellMenuOwner";

fn wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

/// Diagnostic trace -> %LOCALAPPDATA%/com.lepton.explorer/logs/shell-menu-trace.log
///
/// Lightweight, append-only. Used to observe the child-process menu flow when
/// the menu does not appear as expected; harmless in normal operation.
fn trace(step: &str, detail: &str) {
    let base = dirs::data_local_dir().unwrap_or_else(|| std::env::temp_dir());
    let dir = base.join("com.lepton.explorer").join("logs");
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("shell-menu-trace.log"))
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

/// Called at the very start of `run()`. If this process was launched as a
/// shell-menu host (sentinel arg present), it runs the menu and exits — never
/// reaching Tauri. Returns `true` when it handled the invocation (so the caller
/// knows not to continue booting the app).
pub fn run_shell_host_if_invoked() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if let Some(pos) = args.iter().position(|a| a == SHELL_HOST_ARG) {
        trace("host", &format!("invoked; raw_args={args:?}"));
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
            Err(e) => {
                trace("host", &format!("failed: {e}"));
                1
            }
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
    trace("isolated", &format!("path={first_path} x={x} y={y}"));
    unsafe {
        // The Shell classic context menu and many of its extensions rely on
        // OLE (not just COM). Running them without OleInitialize causes access
        // violations in shell extensions.
        let hr = OleInitialize(None);
        let initialized = hr.is_ok();
        if !initialized {
            trace("isolated", &format!("OleInitialize failed: {:?}", hr));
        }
        let res = show_menu_inner(first_path, x, y);
        if initialized {
            OleUninitialize();
        }
        res
    }
}

/// Default window procedure for the invisible owner window. We only need a
/// valid same-thread window that the system can use as the menu's owner; every
/// message is handled by `DefWindowProcW`.
unsafe extern "system" fn owner_wndproc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

/// Create the invisible owner window that the child uses to host the popup
/// menu. It lives on the current (menu) thread, so `TrackPopupMenuEx` has a
/// valid same-thread owner and can display correctly.
fn create_owner_window() -> Option<HWND> {
    unsafe {
        let name = wide(OWNER_CLASS);
        let cn = PCWSTR(name.as_ptr());
        let hmod = GetModuleHandleW(None).unwrap_or_default();
        let hinst = HINSTANCE(hmod.0);

        let wc = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(owner_wndproc),
            hInstance: hinst,
            lpszClassName: cn,
            ..Default::default()
        };
        // RegisterClassW returns 0 on failure; ERROR_CLASS_ALREADY_EXISTS is
        // harmless (e.g. a second invocation in the same process).
        let _ = RegisterClassW(&wc);

        let hwnd = CreateWindowExW(
            Default::default(),
            cn,
            cn,
            WS_OVERLAPPED,
            0,
            0,
            0,
            0,
            None,
            None,
            hinst,
            None,
        );
        match hwnd {
            Ok(h) if !h.0.is_null() => Some(h),
            _ => None,
        }
    }
}

/// Convert CSS-pixel coordinates (as supplied by the webview) to physical
/// screen pixels using the system DPI, so the popup appears at the cursor on
/// HiDPI displays.
fn scale_to_physical(x: i32, y: i32) -> (i32, i32) {
    unsafe {
        let dc = GetDC(None);
        let dpi = if dc.is_invalid() {
            96
        } else {
            GetDeviceCaps(dc, LOGPIXELSX)
        };
        if !dc.is_invalid() {
            let _ = ReleaseDC(None, dc);
        }
        let scale = dpi as f64 / 96.0;
        ((x as f64 * scale) as i32, (y as f64 * scale) as i32)
    }
}

fn show_menu_inner(first_path: &str, x: i32, y: i32) -> Result<(), String> {
    let path = Path::new(first_path);
    let wide_path = wide(&path.to_string_lossy());

    // 1. Parse path → absolute PIDL.
    let mut pidl: *mut Common::ITEMIDLIST = std::ptr::null_mut();
    unsafe {
        SHParseDisplayName(PCWSTR(wide_path.as_ptr()), None, &mut pidl, 0, None)
            .map_err(|e| format!("SHParseDisplayName failed: {e:?}"))?;
    }
    if pidl.is_null() {
        return Err("SHParseDisplayName returned null PIDL".into());
    }

    // 2. Bind to parent IShellFolder + get child PIDL.
    let mut child_pidl: *mut Common::ITEMIDLIST = std::ptr::null_mut();
    let parent_folder = unsafe {
        SHBindToParent::<IShellFolder>(pidl, Some(&mut child_pidl)).map_err(|e| {
            CoTaskMemFree(Some(pidl as *const _));
            format!("SHBindToParent failed: {e:?}")
        })?
    };

    // Free the full PIDL — we only need the child PIDL from here on.
    unsafe {
        CoTaskMemFree(Some(pidl as *const _));
    };

    // 3. Get IContextMenu from parent folder for the child item.
    let child_pidls: [*const Common::ITEMIDLIST; 1] = [child_pidl];
    let context_menu: IContextMenu = unsafe {
        parent_folder.GetUIObjectOf(None, &child_pidls, None).map_err(|e| {
            CoTaskMemFree(Some(child_pidl as *const _));
            format!("GetUIObjectOf failed: {e:?}")
        })?
    };

    // 4. Build popup menu via QueryContextMenu.
    let hmenu: HMENU = unsafe { CreatePopupMenu() }.map_err(|e| {
        unsafe {
            CoTaskMemFree(Some(child_pidl as *const _));
        }
        format!("CreatePopupMenu failed: {e:?}")
    })?;

    unsafe {
        context_menu
            .QueryContextMenu(hmenu, 0, 0, 0x7FFF, CMF_NORMAL)
            .map_err(|e| {
                let _ = DestroyMenu(hmenu);
                CoTaskMemFree(Some(child_pidl as *const _));
                format!("QueryContextMenu failed: {e:?}")
            })?;
    }
    trace("query", "QueryContextMenu ok");

    // 5. Create our OWN owner window (same thread) so TrackPopupMenuEx has a
    //    valid same-thread owner. Using a foreign (parent-process) window — the
    //    previous behavior — made the menu fail to appear.
    let owner = match create_owner_window() {
        Some(h) => h,
        None => {
            unsafe {
                let _ = DestroyMenu(hmenu);
                CoTaskMemFree(Some(child_pidl as *const _));
            }
            return Err("无法创建菜单宿主窗口".into());
        }
    };
    trace("owner", &format!("owner={:p}", owner.0));

    // Scale CSS-pixel coordinates (from the webview) to physical pixels using
    // the system DPI, so the menu appears at the cursor on HiDPI displays.
    let (x, y) = scale_to_physical(x, y);

    // 6. Become foreground so the popup can receive keyboard input and display
    //    correctly. Attach our input thread to the current foreground thread
    //    (the file-manager window) — the documented workaround for showing a
    //    menu from a non-foreground helper process.
    let fg = unsafe { GetForegroundWindow() };
    let cur_thread = unsafe { GetCurrentThreadId() };
    let mut fg_thread = 0u32;
    if !fg.0.is_null() {
        fg_thread = unsafe { GetWindowThreadProcessId(fg, None) };
        if fg_thread != 0 && fg_thread != cur_thread {
            let _ = unsafe { AttachThreadInput(cur_thread, fg_thread, true) };
        } else {
            fg_thread = 0;
        }
    }
    let _ = unsafe { SetForegroundWindow(owner) };
    trace("show", &format!("TrackPopupMenuEx at ({x},{y})"));

    // 7. Show menu (blocks until selection or cancel).
    let flags = TPM_LEFTALIGN.0 | TPM_TOPALIGN.0 | TPM_RETURNCMD.0;
    let cmd = unsafe { TrackPopupMenuEx(hmenu, flags, x, y, owner, None) };
    trace("show", &format!("TrackPopupMenuEx returned cmd={}", cmd.0));

    // 8. Restore foreground + detach input.
    if !fg.0.is_null() {
        let _ = unsafe { SetForegroundWindow(fg) };
    }
    if fg_thread != 0 {
        let _ = unsafe { AttachThreadInput(GetCurrentThreadId(), fg_thread, false) };
    }

    // 9. Invoke selected command. Use the real foreground window as hwnd so any
    //    spawned dialogs inherit the correct owner.
    if cmd.0 > 0 {
        let info = CMINVOKECOMMANDINFO {
            cbSize: std::mem::size_of::<CMINVOKECOMMANDINFO>() as u32,
            fMask: 0,
            hwnd: if fg.0.is_null() { owner } else { fg },
            lpVerb: PCSTR(cmd.0 as usize as *const u8),
            lpParameters: PCSTR::null(),
            lpDirectory: PCSTR::null(),
            nShow: 1, // SW_SHOWNORMAL
            dwHotKey: 0,
            hIcon: Default::default(),
        };
        trace("invoke", &format!("InvokeCommand cmd={}", cmd.0));
        let _ = unsafe { context_menu.InvokeCommand(&info) };
    }

    // 10. Cleanup.
    unsafe {
        CoTaskMemFree(Some(child_pidl as *const _));
        let _ = DestroyMenu(hmenu);
        let _ = DestroyWindow(owner);
    }
    trace("done", "menu complete");
    Ok(())
}
