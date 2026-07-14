use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SpecialFolder {
    pub key: String,
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Drive {
    pub letter: String,
    pub path: String,
}

pub fn special_folders() -> Vec<SpecialFolder> {
    let mut v = vec![SpecialFolder {
        key: "home".into(),
        name: "主页".into(),
        path: dirs::home_dir()
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
    }];
    let push = |v: &mut Vec<SpecialFolder>, key: &str, name: &str, p: Option<std::path::PathBuf>| {
        if let Some(p) = p {
            v.push(SpecialFolder { key: key.into(), name: name.into(), path: p.display().to_string() });
        }
    };
    push(&mut v, "desktop", "桌面", dirs::desktop_dir());
    push(&mut v, "documents", "文档", dirs::document_dir());
    push(&mut v, "downloads", "下载", dirs::download_dir());
    push(&mut v, "pictures", "图片", dirs::picture_dir());
    push(&mut v, "music", "音乐", dirs::audio_dir());
    push(&mut v, "videos", "视频", dirs::video_dir());
    v
}

pub fn list_drives() -> Vec<Drive> {
    #[cfg(windows)]
    {
        use windows::Win32::Storage::FileSystem::GetLogicalDriveStringsW;
        unsafe {
            // Query the required buffer size first, then allocate exactly enough.
            // This avoids truncation if the system has many drives or long paths.
            let required = GetLogicalDriveStringsW(None) as usize;
            let mut buf = vec![0u16; required + 1];
            let len = GetLogicalDriveStringsW(Some(&mut buf)) as usize;
            let s = String::from_utf16_lossy(&buf[..len]);
            s.split('\0')
                .filter(|s| !s.is_empty())
                .map(|d| Drive {
                    letter: d.trim_end_matches('\\').to_string(),
                    path: d.to_string(),
                })
                .collect()
        }
    }
    #[cfg(not(windows))]
    {
        vec![Drive { letter: "/".into(), path: "/".into() }]
    }
}

/// Resolve a well-known folder to its absolute path. Used by the NavPane for
/// OneDrive (which `dirs` does not expose) and as a reusable helper for Gallery
/// (Pictures) and other quick-access nodes. Returns `None` when unavailable
/// (e.g. OneDrive not signed in, or on non-Windows for `onedrive`).
pub fn get_special_folder(kind: &str) -> Option<String> {
    match kind {
        "onedrive" => {
            #[cfg(windows)]
            {
                use windows::Win32::System::Com::CoTaskMemFree;
                use windows::Win32::UI::Shell::{FOLDERID_SkyDrive, KNOWN_FOLDER_FLAG, SHGetKnownFolderPath};
                // The windows wrapper returns the allocated PWSTR directly.
                let pw = unsafe {
                    SHGetKnownFolderPath(&FOLDERID_SkyDrive, KNOWN_FOLDER_FLAG(0), None)
                };
                if let Ok(pw) = pw {
                    if !pw.is_null() {
                        let s = unsafe { windows::core::PCWSTR::from_raw(pw.0).to_string() }
                            .unwrap_or_default();
                        unsafe { CoTaskMemFree(Some(pw.0 as *const core::ffi::c_void)) };
                        return if s.is_empty() { None } else { Some(s) };
                    }
                }
                None
            }
            #[cfg(not(windows))]
            {
                None
            }
        }
        "pictures" => dirs::picture_dir().map(|p| p.display().to_string()),
        "videos" => dirs::video_dir().map(|p| p.display().to_string()),
        "music" => dirs::audio_dir().map(|p| p.display().to_string()),
        "desktop" => dirs::desktop_dir().map(|p| p.display().to_string()),
        "documents" => dirs::document_dir().map(|p| p.display().to_string()),
        "downloads" => dirs::download_dir().map(|p| p.display().to_string()),
        "home" => dirs::home_dir().map(|p| p.display().to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn special_folders_includes_known_folders() {
        let v = special_folders();
        let keys: Vec<&str> = v.iter().map(|f| f.key.as_str()).collect();
        assert!(keys.contains(&"home"));
        assert!(keys.contains(&"documents"));
        assert!(v.iter().all(|f| !f.path.is_empty()));
    }

    #[test]
    fn list_drives_returns_at_least_one_on_windows() {
        let d = list_drives();
        assert!(!d.is_empty());
    }
}
