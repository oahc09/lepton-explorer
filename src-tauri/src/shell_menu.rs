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
use windows::Win32::System::Com::{CoTaskMemAlloc, CoTaskMemFree};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Ole::{OleInitialize, OleUninitialize};
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::Shell::{
    CMF_NORMAL, CMINVOKECOMMANDINFO, Common, IContextMenu, IShellFolder, SHBindToParent,
    SHParseDisplayName,
};
use windows::Win32::Graphics::Gdi::{GetDC, GetDeviceCaps, LOGPIXELSX, ReleaseDC};
use windows::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, BringWindowToTop, CreatePopupMenu, CreateWindowExW, DefWindowProcW,
    DestroyMenu, DestroyWindow, GetForegroundWindow, GetWindowThreadProcessId,
    RegisterClassW, SetForegroundWindow, SetWindowLongPtrW, TrackPopupMenuEx, ASFW_ANY,
    CS_HREDRAW, CS_VREDRAW, GWLP_HWNDPARENT, HMENU, TPM_LEFTALIGN, TPM_RETURNCMD, TPM_TOPALIGN,
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

/// Deep-copy a single `ITEMIDLIST` into independently allocated memory (owned by
/// the caller, to be freed with `CoTaskMemFree`).
///
/// `SHBindToParent`'s `ppidlLast` returns a pointer *into* the full PIDL we pass
/// in — NOT an independent allocation. If we free the full PIDL first, that child
/// pointer becomes dangling and any later use (e.g. `GetUIObjectOf`) crashes with
/// an access violation. So we must clone the child before freeing the full PIDL.
unsafe fn clone_pidl(pidl: *const Common::ITEMIDLIST) -> *mut Common::ITEMIDLIST {
    if pidl.is_null() {
        return std::ptr::null_mut();
    }
    // `cb` is the size in bytes of this whole ITEMIDLIST (including the cb field).
    let cb = (*pidl).mkid.cb as usize;
    if cb < std::mem::size_of::<u16>() {
        return std::ptr::null_mut();
    }
    let copy = CoTaskMemAlloc(cb) as *mut Common::ITEMIDLIST;
    if copy.is_null() {
        return std::ptr::null_mut();
    }
    std::ptr::copy_nonoverlapping(pidl as *const u8, copy as *mut u8, cb);
    copy
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
            run_menu_isolated(&paths, x, y)
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

    // Spawn (do not block yet) so we can grant the child the right to take the
    // foreground before it shows the popup. On Windows the foreground-lock policy
    // blocks `SetForegroundWindow` from a non-foreground process; the foreground
    // process (this app, which is in front when the user right-clicks) must call
    // `AllowSetForegroundWindow` for the child. Without this, Windows 10 (and,
    // depending on focus state, Windows 11) silently refuses to show the menu.
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动上下文菜单子进程失败：{e}"))?;
    // Grant foreground rights. We deliberately use ASFW_ANY (not the specific
    // child PID): the grant from `AllowSetForegroundWindow(pid)` is short-lived
    // and was being silently revoked before the child actually showed the menu —
    // which is exactly why the popup appeared but was never interactive on
    // Windows 10 (its first click was eaten to "activate" the window).
    let _ = unsafe { AllowSetForegroundWindow(ASFW_ANY) };

    let status = child
        .wait()
        .map_err(|e| format!("等待上下文菜单子进程失败：{e}"))?;

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
fn run_menu_isolated(paths: &[String], x: i32, y: i32) -> Result<(), String> {
    trace("isolated", &format!("paths={} x={x} y={y}", paths.len()));
    unsafe {
        // The Shell classic context menu and many of its extensions rely on
        // OLE (not just COM). Running them without OleInitialize causes access
        // violations in shell extensions.
        let hr = OleInitialize(None);
        let initialized = hr.is_ok();
        if !initialized {
            trace("isolated", &format!("OleInitialize failed: {:?}", hr));
        }
        let res = show_menu_inner(paths, x, y);
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

fn show_menu_inner(paths: &[String], x: i32, y: i32) -> Result<(), String> {
    // All selected items must live in the same folder for a merged context
    // menu to make sense (this is always true for Lepton's single-folder
    // selection). If they do, we hand *every* child PIDL to GetUIObjectOf so
    // the Shell produces the same merged menu Explorer shows for a multi-select
    // (e.g. 7-Zip "添加到压缩包" operating on all chosen files). Otherwise we
    // fall back to the first item only.
    let first = &paths[0];
    let common_parent = Path::new(first).parent();
    let same_parent = common_parent.map_or(false, |cp| {
        paths.iter().all(|p| Path::new(p).parent() == Some(cp))
    });

    // 1. Parse the first path → absolute PIDL.
    let mut pidl0: *mut Common::ITEMIDLIST = std::ptr::null_mut();
    {
        let wp = wide(first);
        unsafe {
            SHParseDisplayName(PCWSTR(wp.as_ptr()), None, &mut pidl0, 0, None)
                .map_err(|e| format!("SHParseDisplayName failed: {e:?}"))?;
        }
    }
    if pidl0.is_null() {
        return Err("SHParseDisplayName returned null PIDL".into());
    }

    // 2. Bind to parent IShellFolder + get child PIDL for the first item.
    let mut child0: *mut Common::ITEMIDLIST = std::ptr::null_mut();
    let parent_folder = unsafe {
        SHBindToParent::<IShellFolder>(pidl0, Some(&mut child0)).map_err(|e| {
            CoTaskMemFree(Some(pidl0 as *const _));
            format!("SHBindToParent failed: {e:?}")
        })?
    };
    // `child0` points INTO the full PIDL; clone it to independent memory BEFORE
    // freeing the full PIDL, or GetUIObjectOf later dereferences freed memory.
    child0 = unsafe { clone_pidl(child0) };
    if child0.is_null() {
        unsafe {
            CoTaskMemFree(Some(pidl0 as *const _));
        }
        return Err("无法复制子项 PIDL".into());
    }
    // Free the full PIDL — we now have an independent copy of the child PIDL.
    unsafe {
        CoTaskMemFree(Some(pidl0 as *const _));
    }

    // 3. Collect child PIDLs for the remaining items (same folder only).
    let mut extra_children: Vec<*mut Common::ITEMIDLIST> = Vec::new();
    if same_parent {
        for p in &paths[1..] {
            let wp = wide(p);
            let mut full: *mut Common::ITEMIDLIST = std::ptr::null_mut();
            unsafe {
                if SHParseDisplayName(PCWSTR(wp.as_ptr()), None, &mut full, 0, None).is_err() || full.is_null() {
                    if !full.is_null() {
                        CoTaskMemFree(Some(full as *const _));
                    }
                    continue;
                }
            }
            let mut child: *mut Common::ITEMIDLIST = std::ptr::null_mut();
            let bound = unsafe { SHBindToParent::<IShellFolder>(full, Some(&mut child)).is_ok() };
            // `child` points INTO `full`; clone before freeing `full`.
            let cloned = if bound && !child.is_null() {
                unsafe { clone_pidl(child) }
            } else {
                std::ptr::null_mut()
            };
            unsafe {
                CoTaskMemFree(Some(full as *const _));
            }
            if !cloned.is_null() {
                extra_children.push(cloned);
            }
        }
    }
    trace("collect", &format!("items={} (same_parent={same_parent})", 1 + extra_children.len()));

    // Build the slice of child PIDLs the Shell merges into one menu.
    let mut child_ptrs: Vec<*const Common::ITEMIDLIST> = Vec::with_capacity(1 + extra_children.len());
    child_ptrs.push(child0);
    for c in &extra_children {
        child_ptrs.push(*c);
    }

    // 4. Get the merged IContextMenu from the parent folder for all children.
    let context_menu: IContextMenu = unsafe {
        parent_folder.GetUIObjectOf(None, &child_ptrs, None).map_err(|e| {
            free_children(&mut [child0], &mut extra_children);
            format!("GetUIObjectOf failed: {e:?}")
        })?
    };

    // 5. Build popup menu via QueryContextMenu.
    let hmenu: HMENU = unsafe { CreatePopupMenu() }.map_err(|e| {
        free_children(&mut [child0], &mut extra_children);
        format!("CreatePopupMenu failed: {e:?}")
    })?;

    unsafe {
        context_menu
            .QueryContextMenu(hmenu, 0, 0, 0x7FFF, CMF_NORMAL)
            .map_err(|e| {
                let _ = DestroyMenu(hmenu);
                free_children(&mut [child0], &mut extra_children);
                format!("QueryContextMenu failed: {e:?}")
            })?;
    }
    trace("query", "QueryContextMenu ok");

    // 6. Create our OWN owner window (same thread) so TrackPopupMenuEx has a
    //    valid same-thread owner. Using a foreign (parent-process) window — the
    //    previous behavior — made the menu fail to appear.
    let owner = match create_owner_window() {
        Some(h) => h,
        None => {
            unsafe {
                let _ = DestroyMenu(hmenu);
            }
            free_children(&mut [child0], &mut extra_children);
            return Err("无法创建菜单宿主窗口".into());
        }
    };
    trace("owner", &format!("owner={:p}", owner.0));

    // Scale CSS-pixel coordinates (from the webview) to physical pixels using
    // the system DPI, so the menu appears at the cursor on HiDPI displays.
    let (x, y) = scale_to_physical(x, y);

    // 7. Make the popup interactive despite the Windows foreground-lock policy.
    //    The classic context menu must be shown from a process that is (or is
    //    allowed to become) the foreground. Our menu host is a *separate child
    //    process*, so by default the foreground-lock silently blocks it. The
    //    robust fix has three parts:
    //      (a) attach our input thread to the real foreground thread (the
    //          file-manager window) so messages route correctly;
    //      (b) re-assert foreground on the parent and make our owner window an
    //          *owned* window of that foreground window — an owned window rides
    //          on the foreground window's activation state, so TrackPopupMenuEx
    //          shows it as interactive WITHOUT us having to steal foreground;
    //      (c) still attempt SetForegroundWindow(owner) with a longer retry, and
    //          fall back to BringWindowToTop, so keyboard navigation works too.
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
        // (b) owned-window relationship with the foreground window.
        unsafe {
            let _ = SetWindowLongPtrW(owner, GWLP_HWNDPARENT, fg.0 as isize);
        }
    }
    // (a/c) keep the parent foreground, then try to bring our owner forward.
    let _ = unsafe { SetForegroundWindow(fg) };
    let mut foreground_ok = false;
    for _ in 0..30 {
        if unsafe { SetForegroundWindow(owner) }.as_bool() {
            foreground_ok = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    if !foreground_ok {
        // Last-ditch: at least raise the owner so the menu is visible/clickable.
        let _ = unsafe { BringWindowToTop(owner) };
    }
    trace("show", &format!("TrackPopupMenuEx at ({x},{y}) fg_ok={foreground_ok}"));

    // 8. Show menu (blocks until selection or cancel).
    let flags = TPM_LEFTALIGN.0 | TPM_TOPALIGN.0 | TPM_RETURNCMD.0;
    let cmd = unsafe { TrackPopupMenuEx(hmenu, flags, x, y, owner, None) };
    trace("show", &format!("TrackPopupMenuEx returned cmd={}", cmd.0));

    // 9. Restore foreground + detach input.
    if !fg.0.is_null() {
        let _ = unsafe { SetForegroundWindow(fg) };
    }
    if fg_thread != 0 {
        let _ = unsafe { AttachThreadInput(GetCurrentThreadId(), fg_thread, false) };
    }

    // 10. Invoke selected command. Use the real foreground window as hwnd so any
    //     spawned dialogs inherit the correct owner.
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

    // 11. Cleanup.
    unsafe {
        let _ = DestroyMenu(hmenu);
        let _ = DestroyWindow(owner);
    }
    free_children(&mut [child0], &mut extra_children);
    trace("done", "menu complete");
    Ok(())
}

/// Free the child PIDLs allocated for the merged context menu.
fn free_children(first: &mut [*mut Common::ITEMIDLIST], rest: &mut [*mut Common::ITEMIDLIST]) {
    for c in first.iter_mut().chain(rest.iter_mut()) {
        if !c.is_null() {
            unsafe {
                CoTaskMemFree(Some(*c as *const _));
            }
            *c = std::ptr::null_mut();
        }
    }
}
