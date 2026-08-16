//! "此电脑" (This PC) view: enumerate drives with capacity / usage info.
//!
//! Mirrors Windows Explorer's "This PC" page: each drive is shown with its
//! total / used / free space so the user can see storage at a glance. We surface
//! a dedicated `DriveInfo` list (not a directory `Entry`) because a drive is not
//! a filesystem entry and needs capacity fields the `Entry` struct lacks.

use serde::Serialize;

use windows::core::PCWSTR;
use windows::Win32::Storage::FileSystem::{
    GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDriveStringsW, GetVolumeInformationW,
};

// GetDriveTypeW return values (from Win32::System::WindowsProgramming). We hardcode
// them to avoid pulling in that whole feature set for four constants.
const DRIVE_NO_ROOT_DIR: u32 = 1;
const DRIVE_REMOVABLE: u32 = 2;
const DRIVE_FIXED: u32 = 3;
const DRIVE_REMOTE: u32 = 4;
const DRIVE_CDROM: u32 = 5;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    /// "C:"
    pub letter: String,
    /// "C:\\"
    pub path: String,
    /// Volume label, or a fallback like "本地磁盘" / "可移动磁盘".
    pub label: String,
    /// Total capacity in bytes.
    pub total: u64,
    /// Free space in bytes.
    pub free: u64,
    /// Used space in bytes (total - free).
    pub used: u64,
    /// "fixed" | "removable" | "network" | "cdrom" | "other"
    pub kind: String,
}

fn wstr(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn kind_label(kind: &str) -> String {
    match kind {
        "removable" => "可移动磁盘".into(),
        "network" => "网络驱动器".into(),
        "cdrom" => "光盘驱动器".into(),
        _ => "本地磁盘".into(),
    }
}

pub fn list_thispc() -> Vec<DriveInfo> {
    let mut out = Vec::new();
    unsafe {
        // Query the required buffer size first, then allocate exactly enough.
        let required = GetLogicalDriveStringsW(None) as usize;
        let mut buf = vec![0u16; required + 1];
        let len = GetLogicalDriveStringsW(Some(&mut buf)) as usize;
        let drives = String::from_utf16_lossy(&buf[..len]);

        for d in drives.split('\0').filter(|s| !s.is_empty()) {
            // d looks like "C:\"
            let root = d.to_string();
            let letter = root.trim_end_matches('\\').to_string();

            let drive_type = GetDriveTypeW(PCWSTR(wstr(&root).as_ptr()));
            if drive_type == DRIVE_NO_ROOT_DIR {
                continue;
            }
            let kind = match drive_type {
                DRIVE_REMOVABLE => "removable",
                DRIVE_REMOTE => "network",
                DRIVE_CDROM => "cdrom",
                DRIVE_FIXED => "fixed",
                _ => "other",
            };

            let mut total = 0u64;
            let mut free = 0u64;
            let ok = GetDiskFreeSpaceExW(
                PCWSTR(wstr(&root).as_ptr()),
                None,
                Some(&mut total),
                Some(&mut free),
            );
            // Drives with no media (e.g. an empty optical drive) fail here; skip them.
            if ok.is_err() {
                continue;
            }

            // Volume label; fall back to a kind-based label when empty/unavailable.
            let mut vol = vec![0u16; 256];
            let label = match GetVolumeInformationW(
                PCWSTR(wstr(&root).as_ptr()),
                Some(&mut vol),
                None,
                None,
                None,
                None,
            ) {
                Ok(()) => {
                    let l = String::from_utf16_lossy(&vol);
                    let l = l.trim_end_matches('\0').to_string();
                    if l.is_empty() {
                        kind_label(kind)
                    } else {
                        l
                    }
                }
                Err(_) => kind_label(kind),
            };

            out.push(DriveInfo {
                letter,
                path: root,
                label,
                total,
                free,
                used: total.saturating_sub(free),
                kind: kind.to_string(),
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_thispc_does_not_panic_and_is_bounded() {
        let v = list_thispc();
        // At most the number of drive letters (26) — sanity bound only.
        assert!(v.len() <= 26);
        for d in &v {
            assert!(d.total >= d.free);
            assert_eq!(d.used, d.total - d.free);
        }
    }
}
