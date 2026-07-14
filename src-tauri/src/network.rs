//! Network neighborhood enumeration (Win11 "网络" node).
//!
//! Lists connected network resources of type DISK via the WNet API. Each result
//! is surfaced as a directory `Entry` whose `path` is the UNC name (`\\host\share`),
//! which the frontend can then open through the normal `list_directory` path
//! (UNC paths are valid for `std::fs` on Windows).

use windows::core::PCWSTR;
use windows::Win32::Foundation::HANDLE;
use windows::Win32::NetworkManagement::WNet::{
    WNetCloseEnum, WNetEnumResourceW, WNetOpenEnumW, RESOURCE_CONNECTED, RESOURCETYPE_DISK,
    WNET_OPEN_ENUM_USAGE, NETRESOURCEW,
};

use crate::fs_ops;

const MAX_NETWORK_ENTRIES: usize = 500;

pub fn list_network() -> Vec<fs_ops::Entry> {
    #[cfg(windows)]
    {
        let mut henum: HANDLE = HANDLE::default();
        let st = unsafe {
            WNetOpenEnumW(
                RESOURCE_CONNECTED,
                RESOURCETYPE_DISK,
                WNET_OPEN_ENUM_USAGE(0),
                None,
                &mut henum,
            )
        };
        if st != windows::Win32::Foundation::WIN32_ERROR(0) {
            return vec![];
        }

        let mut out: Vec<fs_ops::Entry> = Vec::new();
        let mut buf = vec![0u16; 16384];
        loop {
            let mut count: u32 = u32::MAX;
            let mut size: u32 = (buf.len() * 2) as u32;
            let st = unsafe {
                WNetEnumResourceW(
                    henum,
                    &mut count,
                    buf.as_mut_ptr() as *mut core::ffi::c_void,
                    &mut size,
                )
            };
            if st != windows::Win32::Foundation::WIN32_ERROR(0) {
                break;
            }
            if count == 0 {
                break;
            }
            let ptr = buf.as_ptr() as *const NETRESOURCEW;
            for i in 0..count as usize {
                if out.len() >= MAX_NETWORK_ENTRIES {
                    break;
                }
                let nr = unsafe { *ptr.add(i) };
                let remote = unsafe {
                    PCWSTR::from_raw(nr.lpRemoteName.0 as *const u16)
                        .to_string()
                        .unwrap_or_default()
                };
                if remote.is_empty() {
                    continue;
                }
                let name = remote
                    .rsplit('\\')
                    .next()
                    .filter(|s| !s.is_empty())
                    .unwrap_or(&remote)
                    .to_string();
                out.push(fs_ops::Entry {
                    name,
                    path: remote,
                    is_dir: true,
                    size: 0,
                    modified: 0,
                    created: 0,
                    accessed: 0,
                    type_label: "网络位置".into(),
                    ext: String::new(),
                    is_hidden: false,
                    is_system: false,
                    is_read_only: false,
                });
            }
            if out.len() >= MAX_NETWORK_ENTRIES {
                break;
            }
        }
        unsafe {
            let _ = WNetCloseEnum(henum);
        }
        out
    }
    #[cfg(not(windows))]
    {
        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_network_does_not_panic() {
        // Enumerating the network must never panic; on a machine with no network
        // shares it simply returns an empty list.
        let v = list_network();
        assert!(v.len() <= MAX_NETWORK_ENTRIES);
    }
}
