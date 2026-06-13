use std::fs;
use std::path::{Path, PathBuf};

pub fn create_dir(path: &str) -> std::io::Result<()> {
    fs::create_dir(Path::new(path))
}

pub fn create_file(path: &str) -> std::io::Result<()> {
    fs::File::create(Path::new(path))?;
    Ok(())
}

pub fn rename(from: &str, to: &str) -> std::io::Result<()> {
    fs::rename(Path::new(from), Path::new(to))
}

/// Return a non-existing path next to `dst` by appending " (n)" before the extension.
pub fn unique_path(dst: &Path) -> PathBuf {
    if !dst.exists() {
        return dst.to_path_buf();
    }
    let stem = dst.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = dst.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let parent = dst.parent().unwrap_or_else(|| Path::new(""));
    let mut n = 1;
    loop {
        let cand = parent.join(format!("{} ({}){}", stem, n, ext));
        if !cand.exists() {
            return cand;
        }
        n += 1;
    }
}

fn copy_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if src.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let from = entry.path();
            let to = dst.join(entry.file_name());
            copy_recursive(&from, &to)?;
        }
        Ok(())
    } else {
        fs::copy(src, dst).map(|_| ())
    }
}

fn remove_recursive(p: &Path) -> std::io::Result<()> {
    if p.is_dir() { fs::remove_dir_all(p) } else { fs::remove_file(p) }
}

/// Copy each source into `dest_dir` (auto-renaming on collision). Returns the resulting paths.
pub fn copy_items(sources: &[String], dest_dir: &str) -> std::io::Result<Vec<String>> {
    let dest = Path::new(dest_dir);
    let mut out = Vec::new();
    for s in sources {
        let src = Path::new(s);
        let name = src.file_name().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "no file name"))?;
        let target = unique_path(&dest.join(name));
        copy_recursive(src, &target)?;
        out.push(target.to_string_lossy().to_string());
    }
    Ok(out)
}

/// Move each source into `dest_dir` (same-volume = rename; cross-volume = copy+delete).
/// Returns Vec<(old_path, new_path)>.
pub fn move_items(sources: &[String], dest_dir: &str) -> std::io::Result<Vec<(String, String)>> {
    let dest = Path::new(dest_dir);
    let mut out = Vec::new();
    for s in sources {
        let src = Path::new(s);
        let name = src.file_name().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "no file name"))?;
        let target = unique_path(&dest.join(name));
        let old = src.to_string_lossy().to_string();
        match fs::rename(src, &target) {
            Ok(()) => {}
            Err(e) if e.raw_os_error() == Some(18) => {
                // EXDEV (cross-device link) — copy then delete source.
                copy_recursive(src, &target)?;
                remove_recursive(src)?;
            }
            Err(e) => return Err(e),
        }
        out.push((old, target.to_string_lossy().to_string()));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn create_dir_and_file_work() {
        let d = tempdir().unwrap();
        let dp = d.path().join("newdir");
        create_dir(dp.to_str().unwrap()).unwrap();
        assert!(dp.is_dir());
        let fp = dp.join("a.txt");
        create_file(fp.to_str().unwrap()).unwrap();
        assert!(fp.is_file());
    }

    #[test]
    fn rename_moves_a_file() {
        let d = tempdir().unwrap();
        let a = d.path().join("a.txt");
        let b = d.path().join("b.txt");
        fs::write(&a, "x").unwrap();
        rename(a.to_str().unwrap(), b.to_str().unwrap()).unwrap();
        assert!(!a.exists());
        assert!(b.is_file());
    }

    #[test]
    fn rename_missing_returns_err() {
        assert!(rename("Z:/no/x", "Z:/no/y").is_err());
    }

    #[test]
    fn copy_items_copies_files_and_returns_new_paths() {
        let d = tempdir().unwrap();
        let src1 = d.path().join("a.txt"); fs::write(&src1, "1").unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        let new_paths = copy_items(&[src1.to_str().unwrap().to_string()], dest.to_str().unwrap()).unwrap();
        assert_eq!(new_paths.len(), 1);
        assert!(dest.join("a.txt").is_file());
    }

    #[test]
    fn copy_items_auto_renames_on_collision() {
        let d = tempdir().unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "1").unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        fs::write(dest.join("a.txt"), "existing").unwrap();
        let new_paths = copy_items(&[src.to_str().unwrap().to_string()], dest.to_str().unwrap()).unwrap();
        assert!(dest.join("a.txt").is_file());
        assert!(dest.join("a (1).txt").is_file());
        assert!(new_paths[0].ends_with("a (1).txt"));
    }

    #[test]
    fn copy_items_copies_directory_recursively() {
        let d = tempdir().unwrap();
        let srcdir = d.path().join("folder"); fs::create_dir(&srcdir).unwrap();
        fs::write(srcdir.join("inner.txt"), "x").unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        copy_items(&[srcdir.to_str().unwrap().to_string()], dest.to_str().unwrap()).unwrap();
        assert!(dest.join("folder").is_dir());
        assert!(dest.join("folder").join("inner.txt").is_file());
        // source must remain (copy, not move)
        assert!(srcdir.join("inner.txt").is_file());
    }

    #[test]
    fn move_items_moves_within_same_volume() {
        let d = tempdir().unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "1").unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        let moved = move_items(&[src.to_str().unwrap().to_string()], dest.to_str().unwrap()).unwrap();
        assert!(!src.exists());
        assert!(dest.join("a.txt").is_file());
        assert!(moved[0].1.ends_with("a.txt"));
    }
}
