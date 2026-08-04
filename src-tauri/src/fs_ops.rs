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
    // Skip individual unreadable entries (locked file, race with a delete)
    // instead of failing the whole listing — same degradation as `search`.
    for rd in fs::read_dir(dir)? {
        let rd = match rd {
            Ok(e) => e,
            Err(_) => continue,
        };
        let meta = match rd.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let name = rd.file_name().to_string_lossy().to_string();
        let path = rd.path().to_string_lossy().to_string();
        entries.push(entry_from(&name, &path, &meta));
    }
    // Win11 default: folders first, then name ascending (case-insensitive).
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

fn entry_from(name: &str, path: &str, meta: &fs::Metadata) -> Entry {
    let ft = meta.file_type();
    let ext = Path::new(name)
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

    #[cfg(windows)]
    let is_system = {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
        (meta.file_attributes() & FILE_ATTRIBUTE_SYSTEM) != 0
    };
    #[cfg(not(windows))]
    let is_system = false;

    let type_label = type_label_for(name, ft.is_dir());

    Entry {
        name: name.to_string(),
        path: path.to_string(),
        is_dir: ft.is_dir(),
        size: if ft.is_dir() { 0 } else { meta.len() },
        modified: to_ms(meta.modified()),
        created: to_ms(meta.created()),
        accessed: to_ms(meta.accessed()),
        type_label,
        ext,
        is_hidden,
        is_system,
        is_read_only: meta.permissions().readonly(),
    }
}

/// Maximum number of search results to return. Prevents unbounded memory
/// consumption when searching a large directory tree (e.g. C:\ with "" query).
const SEARCH_MAX_RESULTS: usize = 5000;

pub fn search(root: &str, query: &str) -> std::io::Result<Vec<Entry>> {
    let q = query.to_lowercase();
    let mut out = Vec::new();
    let mut stack: Vec<std::path::PathBuf> = vec![std::path::PathBuf::from(root)];
    // Cycle guard: canonicalized paths we've already walked, to avoid infinite
    // recursion through symlink/junction loops (e.g. A->B, B->A).
    let mut visited: std::collections::HashSet<std::path::PathBuf> = std::collections::HashSet::new();
    if let Ok(canon_root) = fs::canonicalize(root) {
        visited.insert(canon_root);
    }
    while let Some(dir) = stack.pop() {
        if out.len() >= SEARCH_MAX_RESULTS {
            break;
        }
        let rd = match fs::read_dir(&dir) { Ok(r) => r, Err(_) => continue };
        for de in rd.flatten() {
            if out.len() >= SEARCH_MAX_RESULTS {
                break;
            }
            let meta = match de.metadata() { Ok(m) => m, Err(_) => continue };
            let name = de.file_name().to_string_lossy().to_string();
            let path = de.path().to_string_lossy().to_string();
            if name.to_lowercase().contains(&q) {
                out.push(entry_from(&name, &path, &meta));
            }
            if meta.is_dir() {
                if let Ok(canon) = fs::canonicalize(de.path()) {
                    if visited.insert(canon) {
                        stack.push(de.path());
                    }
                }
            }
        }
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

pub fn folder_size(path: &str) -> std::io::Result<u64> {
    let mut total: u64 = 0;
    let mut stack: Vec<std::path::PathBuf> = vec![std::path::PathBuf::from(path)];
    // Cycle guard against symlink/junction loops.
    let mut visited: std::collections::HashSet<std::path::PathBuf> = std::collections::HashSet::new();
    if let Ok(canon_root) = fs::canonicalize(path) {
        visited.insert(canon_root);
    }
    while let Some(dir) = stack.pop() {
        let rd = match fs::read_dir(&dir) { Ok(r) => r, Err(_) => continue };
        for de in rd.flatten() {
            let meta = match de.metadata() { Ok(m) => m, Err(_) => continue };
            if meta.is_dir() {
                if let Ok(canon) = fs::canonicalize(de.path()) {
                    if visited.insert(canon) {
                        stack.push(de.path());
                    }
                }
            } else {
                total += meta.len();
            }
        }
    }
    Ok(total)
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

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PathSuggestion {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// Address-bar autocomplete: given a partial path, return the children of the
/// deepest existing parent directory whose name starts with the typed remainder.
/// e.g. "C:\Users\ca\Do" → children of "C:\Users\ca" whose name starts with "Do".
pub fn suggest_paths(prefix: &str) -> Vec<PathSuggestion> {
    let p = prefix.replace('/', "\\");
    let p = p.trim_end_matches('\\');
    if p.is_empty() {
        return Vec::new();
    }
    let pp = Path::new(p);
    let (dir, partial) = if pp.is_dir() {
        (p.to_string(), String::new())
    } else if let Some(i) = p.rfind('\\') {
        (p[..i].to_string(), p[i + 1..].to_string())
    } else if p.len() == 2 && p.ends_with(':') {
        // Bare drive letter "C:" → its root.
        (format!("{}\\", p), String::new())
    } else {
        return Vec::new();
    };
    let dir_path = Path::new(&dir);
    if !dir_path.is_dir() {
        return Vec::new();
    }
    let pl = partial.to_lowercase();
    let mut out: Vec<PathSuggestion> = fs::read_dir(dir_path)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if !name.to_lowercase().starts_with(&pl) {
                return None;
            }
            Some(PathSuggestion {
                path: dir_path.join(&name).to_string_lossy().to_string(),
                is_dir: e.path().is_dir(),
                name,
            })
        })
        .collect();
    // Folders first, then name (case-insensitive); cap at 20.
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    out.truncate(20);
    out
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

    #[test]
    fn search_finds_by_name_recursively() {
        let d = tempdir().unwrap();
        fs::create_dir_all(d.path().join("sub")).unwrap();
        fs::write(d.path().join("sub").join("report.txt"), "x").unwrap();
        fs::write(d.path().join("other.md"), "y").unwrap();
        let hits = search(d.path().to_str().unwrap(), "report").unwrap();
        let names: Vec<&str> = hits.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"report.txt"));
        assert!(!names.contains(&"other.md"));
    }

    #[test]
    fn search_is_case_insensitive() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("README.md"), "x").unwrap();
        let hits = search(d.path().to_str().unwrap(), "readme").unwrap();
        assert!(hits.iter().any(|e| e.name == "README.md"));
    }

    #[test]
    fn folder_size_sums_files() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("a.txt"), "12345").unwrap();
        fs::create_dir_all(d.path().join("sub")).unwrap();
        fs::write(d.path().join("sub").join("b.txt"), "ab").unwrap();
        assert_eq!(folder_size(d.path().to_str().unwrap()).unwrap(), 7);
    }

    #[test]
    fn search_with_empty_query_returns_all_entries() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("a.txt"), "x").unwrap();
        fs::write(d.path().join("b.md"), "y").unwrap();
        let hits = search(d.path().to_str().unwrap(), "").unwrap();
        assert!(hits.iter().any(|e| e.name == "a.txt"));
        assert!(hits.iter().any(|e| e.name == "b.md"));
    }

    #[test]
    fn folder_size_empty_dir_is_zero() {
        let d = tempdir().unwrap();
        assert_eq!(folder_size(d.path().to_str().unwrap()).unwrap(), 0);
    }

    #[test]
    fn folder_size_ignores_subdir_entry_sizes_but_sums_their_files() {
        let d = tempdir().unwrap();
        fs::create_dir_all(d.path().join("s")).unwrap();
        fs::write(d.path().join("s").join("x"), "123").unwrap(); // 3
        fs::write(d.path().join("top"), "12").unwrap();            // 2
        assert_eq!(folder_size(d.path().to_str().unwrap()).unwrap(), 5);
    }

    #[test]
    fn suggest_paths_matches_children_by_prefix() {
        let d = tempdir().unwrap();
        fs::create_dir_all(d.path().join("Documents")).unwrap();
        fs::create_dir_all(d.path().join("Downloads")).unwrap();
        fs::write(d.path().join("data.txt"), "x").unwrap();
        let base = d.path().to_string_lossy().to_string();
        // prefix = base + "\Do" → children of base starting with "Do"
        let s = suggest_paths(&format!("{}\\Do", base));
        let names: Vec<&str> = s.iter().map(|x| x.name.as_str()).collect();
        assert!(names.contains(&"Documents"));
        assert!(names.contains(&"Downloads"));
        assert!(!names.contains(&"data.txt"));
        assert!(s.iter().all(|x| x.is_dir)); // both matches are dirs
    }

    #[test]
    fn suggest_paths_existing_dir_lists_all_children() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("apple.txt"), "x").unwrap();
        fs::write(d.path().join("banana.txt"), "x").unwrap();
        let s = suggest_paths(d.path().to_str().unwrap());
        let names: Vec<&str> = s.iter().map(|x| x.name.as_str()).collect();
        assert!(names.contains(&"apple.txt"));
        assert!(names.contains(&"banana.txt"));
    }

    #[test]
    fn suggest_paths_case_insensitive_prefix() {
        let d = tempdir().unwrap();
        fs::create_dir_all(d.path().join("Documents")).unwrap();
        let base = d.path().to_string_lossy().to_string();
        let s = suggest_paths(&format!("{}\\doc", base)); // lowercase prefix
        assert!(s.iter().any(|x| x.name == "Documents"));
    }

    #[test]
    fn suggest_paths_nonexistent_parent_returns_empty() {
        assert!(suggest_paths("Z:\\no\\such\\path\\X").is_empty());
    }
}
