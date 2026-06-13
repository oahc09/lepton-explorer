use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::SystemTime;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: i64,
    pub created: i64,
    pub accessed: i64,
    pub type_label: String,
    pub ext: String,
    pub is_hidden: bool,
    pub is_system: bool,
    pub is_read_only: bool,
}

pub fn list_directory(dir: &str) -> std::io::Result<Vec<Entry>> {
    let mut entries = Vec::new();
    for rd in fs::read_dir(dir)? {
        let rd = rd?;
        let meta = rd.metadata()?;
        let ft = meta.file_type();
        let name = rd.file_name().to_string_lossy().to_string();
        let path = rd.path().to_string_lossy().to_string();
        let ext = Path::new(&name)
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_string())
            .unwrap_or_default();

        #[cfg(windows)]
        let is_hidden = {
            use std::os::windows::fs::MetadataExt;
            const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
            (meta.file_attributes() & FILE_ATTRIBUTE_HIDDEN) != 0
        };
        #[cfg(not(windows))]
        let is_hidden = name.starts_with('.');

        let type_label = type_label_for(&name, ft.is_dir());

        entries.push(Entry {
            name,
            path,
            is_dir: ft.is_dir(),
            size: if ft.is_dir() { 0 } else { meta.len() },
            modified: to_ms(meta.modified()),
            created: to_ms(meta.created()),
            accessed: to_ms(meta.accessed()),
            type_label,
            ext,
            is_hidden,
            is_system: false,
            is_read_only: meta.permissions().readonly(),
        });
    }
    // Win11 default: folders first, then name ascending (case-insensitive).
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

fn to_ms(t: std::io::Result<SystemTime>) -> i64 {
    t.ok()
        .and_then(|st| st.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn type_label_for(name: &str, is_dir: bool) -> String {
    if is_dir {
        return "文件夹".to_string();
    }
    match Path::new(name).extension().and_then(|e| e.to_str()) {
        Some(e) => format!("{} 文件", e.to_uppercase()),
        None => "文件".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn lists_files_and_folders_with_folders_first() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("z_folder")).unwrap();
        fs::write(dir.path().join("a.txt"), "hi").unwrap();
        let entries = list_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_dir, "folder must come first");
        assert_eq!(entries[0].name, "z_folder");
        assert_eq!(entries[1].name, "a.txt");
        assert_eq!(entries[1].ext, "txt");
        assert_eq!(entries[1].type_label, "TXT 文件");
        assert_eq!(entries[1].size, 2);
        assert!(!entries[1].is_dir);
    }

    #[test]
    fn missing_dir_returns_error() {
        assert!(list_directory("Z:/nope/does/not/exist").is_err());
    }

    #[test]
    fn entry_serializes_to_camel_case_for_frontend_contract() {
        let e = Entry {
            name: "a.txt".into(), path: "C:\\a.txt".into(), is_dir: false,
            size: 1, modified: 0, created: 0, accessed: 0,
            type_label: "TXT 文件".into(), ext: "txt".into(),
            is_hidden: false, is_system: false, is_read_only: false,
        };
        let json = serde_json::to_string(&e).unwrap();
        // camelCase keys the TS frontend expects (src/types.ts).
        assert!(json.contains("\"isDir\""), "got: {json}");
        assert!(json.contains("\"typeLabel\""), "got: {json}");
        assert!(json.contains("\"isReadOnly\""), "got: {json}");
        assert!(json.contains("\"isHidden\""), "got: {json}");
        assert!(json.contains("\"isSystem\""), "got: {json}");
        // snake_case keys must NOT appear on the wire.
        assert!(!json.contains("is_dir"));
        assert!(!json.contains("type_label"));
        assert!(!json.contains("is_read_only"));
    }
}
