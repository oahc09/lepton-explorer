//! "打开方式" (Open With) support.
//!
//! Enumerates applications associated with a file's extension by reading the
//! Windows registry (HKCR), and launches a chosen app via `ShellExecuteExW`.
//! The "look for another app on this PC" entry uses the system `openas` verb,
//! which opens the native Open With dialog.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::System::Registry::{
    HKEY, HKEY_CLASSES_ROOT, KEY_READ, RegCloseKey, RegEnumKeyExW, RegEnumValueW, RegOpenKeyExW,
    RegQueryValueExW,
};
use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SW_SHOWNORMAL};

use crate::error::{AppError, Result};

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenWithApp {
    pub name: String,
    pub exe: String,
    pub is_default: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWithInfo {
    pub default: Option<OpenWithApp>,
    pub apps: Vec<OpenWithApp>,
}

fn wide(s: &str) -> Vec<u16> {
    OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

fn reg_open(root: HKEY, sub: &str) -> Option<HKEY> {
    let w = wide(sub);
    let mut hk: HKEY = HKEY::default();
    let st = unsafe { RegOpenKeyExW(root, PCWSTR(w.as_ptr()), 0, KEY_READ, &mut hk) };
    if st.is_ok() {
        Some(hk)
    } else {
        None
    }
}

fn reg_query_value_raw(hkey: HKEY, name: PCWSTR) -> Option<String> {
    let mut cb: u32 = 0;
    // First call: discover the required buffer size (in bytes).
    let r1 = unsafe { RegQueryValueExW(hkey, name, None, None, None, Some(&mut cb)) };
    if r1.is_err() || cb == 0 {
        return None;
    }
    let mut buf: Vec<u8> = vec![0u8; cb as usize];
    let r2 = unsafe {
        RegQueryValueExW(
            hkey,
            name,
            None,
            None,
            Some(buf.as_mut_ptr()),
            Some(&mut cb),
        )
    };
    if r2.is_err() {
        return None;
    }
    let words: Vec<u16> = buf
        .chunks_exact(2)
        .map(|c| u16::from_ne_bytes([c[0], c[1]]))
        .collect();
    let s = String::from_utf16_lossy(&words);
    let s = s.trim_end_matches('\0').to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn reg_query_value(hkey: HKEY, name: &str) -> Option<String> {
    let w = wide(name);
    reg_query_value_raw(hkey, PCWSTR(w.as_ptr()))
}

fn reg_query_default(hkey: HKEY) -> Option<String> {
    reg_query_value_raw(hkey, PCWSTR::null())
}

fn reg_default_string(root: HKEY, sub: &str) -> Option<String> {
    let hk = reg_open(root, sub)?;
    let v = reg_query_default(hk);
    unsafe {
        let _ = RegCloseKey(hk);
    }
    v
}

fn reg_enum_subkeys(hkey: HKEY) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0u32;
    loop {
        let mut name_buf = [0u16; 256];
        let mut name_len = 256u32;
        let st = unsafe {
            RegEnumKeyExW(
                hkey,
                i,
                PWSTR(name_buf.as_mut_ptr()),
                &mut name_len,
                None,
                PWSTR::null(),
                None,
                None,
            )
        };
        if st.is_err() {
            break;
        }
        out.push(String::from_utf16_lossy(&name_buf[..name_len as usize]));
        i += 1;
    }
    out
}

fn reg_enum_value_names(hkey: HKEY) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0u32;
    loop {
        let mut name_buf = [0u16; 256];
        let mut name_len = 256u32;
        let st = unsafe {
            RegEnumValueW(
                hkey,
                i,
                PWSTR(name_buf.as_mut_ptr()),
                &mut name_len,
                None,
                None,
                None,
                None,
            )
        };
        if st.is_err() {
            break;
        }
        out.push(String::from_utf16_lossy(&name_buf[..name_len as usize]));
        i += 1;
    }
    out
}

// ---------------------------------------------------------------------------
// App resolution
// ---------------------------------------------------------------------------

fn exe_from_command(cmd: &str) -> Option<String> {
    let cmd = cmd.trim();
    if cmd.is_empty() {
        return None;
    }
    if cmd.starts_with('"') {
        let end = cmd[1..].find('"')?;
        Some(cmd[1..=end].to_string())
    } else {
        let end = cmd.find(|c: char| c == ' ' || c == '\t')?;
        Some(cmd[..end].to_string())
    }
}

fn exe_name(exe: &str) -> String {
    Path::new(exe)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| exe.to_string())
}

fn open_command(hk: HKEY) -> Option<String> {
    reg_query_value(hk, "shell\\open\\command")
        .or_else(|| reg_query_value(hk, "shell\\Open\\command"))
}

/// Build an `OpenWithApp` from a ProgID key (e.g. `txtfile`).
fn app_from_progid(progid: &str) -> Option<OpenWithApp> {
    let hk = reg_open(HKEY_CLASSES_ROOT, progid)?;
    let name = reg_query_default(hk).filter(|s| !s.is_empty() && !s.starts_with('@'));
    let cmd = open_command(hk);
    unsafe {
        let _ = RegCloseKey(hk);
    }
    let exe = cmd.as_ref().and_then(|c| exe_from_command(c))?;
    let name = name.unwrap_or_else(|| exe_name(&exe));
    Some(OpenWithApp {
        name,
        exe,
        is_default: false,
    })
}

/// Build an `OpenWithApp` from an `HKCR\Applications\{name}` entry.
fn app_from_application(name: &str) -> Option<OpenWithApp> {
    let hk = reg_open(HKEY_CLASSES_ROOT, &format!("Applications\\{}", name))?;
    let cmd = open_command(hk);
    unsafe {
        let _ = RegCloseKey(hk);
    }
    let exe = cmd.as_ref().and_then(|c| exe_from_command(c))?;
    Some(OpenWithApp {
        name: exe_name(&exe),
        exe,
        is_default: false,
    })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub fn get_open_with(path: &str) -> OpenWithInfo {
    let ext = Path::new(path)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
        .unwrap_or_default();
    if ext.is_empty() {
        return OpenWithInfo {
            default: None,
            apps: vec![],
        };
    }

    let root = HKEY_CLASSES_ROOT;
    let mut apps: Vec<OpenWithApp> = Vec::new();
    let mut default: Option<OpenWithApp> = None;

    if let Some(progid) = reg_default_string(root, &ext) {
        if let Some(mut app) = app_from_progid(&progid) {
            app.is_default = true;
            default = Some(app.clone());
            apps.push(app);
        }
    }

    if let Some(hk) = reg_open(root, &format!("{}\\OpenWithProgids", ext)) {
        for pid in reg_enum_value_names(hk) {
            if let Some(app) = app_from_progid(&pid) {
                if !apps
                    .iter()
                    .any(|x| x.exe.eq_ignore_ascii_case(&app.exe))
                {
                    apps.push(app);
                }
            }
        }
        unsafe {
            let _ = RegCloseKey(hk);
        }
    }

    if let Some(hk) = reg_open(root, &format!("{}\\OpenWithList", ext)) {
        for name in reg_enum_subkeys(hk) {
            if let Some(app) = app_from_application(&name) {
                if !apps
                    .iter()
                    .any(|x| x.exe.eq_ignore_ascii_case(&app.exe))
                {
                    apps.push(app);
                }
            }
        }
        unsafe {
            let _ = RegCloseKey(hk);
        }
    }

    if let Some(hk) = reg_open(root, "Applications") {
        for name in reg_enum_subkeys(hk) {
            if let Some(sup) = reg_open(hk, &format!("{}\\SupportedTypes", name)) {
                let types = reg_enum_value_names(sup);
                unsafe {
                    let _ = RegCloseKey(sup);
                }
                if types.iter().any(|t| t.eq_ignore_ascii_case(&ext)) {
                    if let Some(app) = app_from_application(&name) {
                        if !apps
                            .iter()
                            .any(|x| x.exe.eq_ignore_ascii_case(&app.exe))
                        {
                            apps.push(app);
                        }
                    }
                }
            }
        }
        unsafe {
            let _ = RegCloseKey(hk);
        }
    }

    apps.truncate(20);
    OpenWithInfo { default, apps }
}

fn shell_execute(exe: &str, params: &str) -> Result<()> {
    let exe_w = wide(exe);
    let params_w = wide(params);
    let mut info = SHELLEXECUTEINFOW::default();
    info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    info.hwnd = unsafe { GetForegroundWindow() };
    info.lpFile = PCWSTR(exe_w.as_ptr());
    info.lpParameters = PCWSTR(params_w.as_ptr());
    info.nShow = SW_SHOWNORMAL.0 as i32;
    let ok = unsafe { ShellExecuteExW(&mut info) };
    if ok.is_ok() {
        Ok(())
    } else {
        Err(AppError::Unknown(format!("无法启动应用: {}", exe)))
    }
}

/// Open `path` with a specific application executable.
pub fn open_with_path(path: &str, exe: &str) -> Result<()> {
    shell_execute(exe, &format!("\"{}\"", path))
}

/// Open `path` with the system's default program for its file type.
///
/// Resolution order (so images like PNG open with the corresponding system
/// software, e.g. the Photos app):
/// 1. The registered default application (from the Windows registry / ProgID),
///    launched directly via its executable. This guarantees the *matching*
///    system software is used rather than some unrelated handler.
/// 2. Fallback: `ShellExecuteExW` with the `open` verb, which lets Windows
///    pick the handler. This covers UWP / Store apps (e.g. Photos) that have
///    no classic command string in the registry.
pub fn open_file(path: &str) -> Result<()> {
    if let Some(default) = get_open_with(path).default {
        if open_with_path(path, &default.exe).is_ok() {
            return Ok(());
        }
    }
    shell_execute_open(path)
}

fn shell_execute_open(path: &str) -> Result<()> {
    let file_w = wide(path);
    let verb_w = wide("open");
    let mut info = SHELLEXECUTEINFOW::default();
    info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    info.hwnd = unsafe { GetForegroundWindow() };
    info.lpFile = PCWSTR(file_w.as_ptr());
    info.lpVerb = PCWSTR(verb_w.as_ptr());
    info.nShow = SW_SHOWNORMAL.0 as i32;
    let ok = unsafe { ShellExecuteExW(&mut info) };
    if ok.is_ok() {
        Ok(())
    } else {
        Err(AppError::Unknown(format!("无法打开文件: {}", path)))
    }
}

/// Open the system "Open With" dialog for `path` (the `openas` verb).
pub fn open_with_dialog(path: &str) -> Result<()> {
    let file_w = wide(path);
    let verb_w = wide("openas");
    let mut info = SHELLEXECUTEINFOW::default();
    info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    info.hwnd = unsafe { GetForegroundWindow() };
    info.lpFile = PCWSTR(file_w.as_ptr());
    info.lpVerb = PCWSTR(verb_w.as_ptr());
    info.nShow = SW_SHOWNORMAL.0 as i32;
    let ok = unsafe { ShellExecuteExW(&mut info) };
    if ok.is_ok() {
        Ok(())
    } else {
        Err(AppError::Unknown(format!("无法打开“打开方式”对话框: {}", path)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_extension_yields_empty() {
        let info = get_open_with("README");
        assert!(info.default.is_none());
        assert!(info.apps.is_empty());
    }

    #[test]
    fn common_extension_does_not_panic() {
        // Machine-dependent, but must never panic.
        let info = get_open_with("C:\\temp\\sample.txt");
        let _ = info;
    }
}
