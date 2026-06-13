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
            let mut buf = [0u16; 260];
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
