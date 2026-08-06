//! Auto-start on Windows logon via the HKCU "Run" registry key.
//!
//! No third-party plugin required: we write/remove a `REG_SZ` value named
//! `LeptonExplorer` under
//! `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` pointing at the
//! running executable. The default state is OFF (value absent), so a fresh
//! install never auto-launches unless the user opts in.

use std::path::PathBuf;

use windows::core::PCWSTR;
use windows::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_SZ, RegCloseKey,
    RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW,
};

use crate::error::{AppError, Result};

const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const VALUE_NAME: &str = "LeptonExplorer";

/// Release the registry key on drop so both code paths close it cleanly.
struct KeyGuard(HKEY);
impl Drop for KeyGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = RegCloseKey(self.0);
        }
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Whether the app launches on Windows logon.
pub fn is_autostart_enabled() -> bool {
    let sub = wide(RUN_KEY);
    let mut hk = HKEY::default();
    let st = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, PCWSTR(sub.as_ptr()), 0, KEY_QUERY_VALUE, &mut hk) };
    if st.is_err() {
        return false;
    }
    let _guard = KeyGuard(hk);
    let name = wide(VALUE_NAME);
    let mut cb: u32 = 0;
    let r = unsafe { RegQueryValueExW(hk, PCWSTR(name.as_ptr()), None, None, None, Some(&mut cb)) };
    r.is_ok() && cb > 0
}

/// Enable or disable launching on Windows logon.
pub fn set_autostart(enabled: bool) -> Result<()> {
    let sub = wide(RUN_KEY);
    let mut hk = HKEY::default();
    let st = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, PCWSTR(sub.as_ptr()), 0, KEY_SET_VALUE, &mut hk) };
    if st.is_err() {
        return Err(AppError::Unknown(format!("打开 Run 注册表键失败: {st:?}")));
    }
    let _guard = KeyGuard(hk);
    let name = wide(VALUE_NAME);

    if enabled {
        let exe = std::env::current_exe()
            .map_err(|e| AppError::Unknown(format!("获取 exe 路径失败: {e}")))?;
        let quoted = format!("\"{}\"", PathBuf::from(exe).display());
        let data: Vec<u16> = quoted.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes: Vec<u8> = data.iter().flat_map(|u| u.to_le_bytes()).collect();
        let st = unsafe { RegSetValueExW(hk, PCWSTR(name.as_ptr()), 0, REG_SZ, Some(&bytes)) };
        if st.is_err() {
            return Err(AppError::Unknown(format!("写入开机启动注册表失败: {st:?}")));
        }
    } else {
        // Disabling is idempotent: removing an absent value is already "off".
        let _ = unsafe { RegDeleteValueW(hk, PCWSTR(name.as_ptr())) };
    }
    Ok(())
}
