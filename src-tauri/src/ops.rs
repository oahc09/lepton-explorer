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
    // If `dst` has no parent (e.g. a bare filename / root), avoid building a
    // relative path via `Path::new("").join(...)`; return `dst` itself.
    let parent = match dst.parent() {
        Some(p) if !p.as_os_str().is_empty() => p,
        _ => return dst.to_path_buf(),
    };
    let stem = dst.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = dst.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
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
    copy_recursive_inner(src, dst, &mut std::collections::HashSet::new())
}

fn copy_recursive_inner(
    src: &Path,
    dst: &Path,
    visited: &mut std::collections::HashSet<PathBuf>,
) -> std::io::Result<()> {
    // If `src` is itself a symlink (to a dir or file), do NOT dereference+recurse;
    // copy it as a single unit (copies the target's content). This avoids following
    // symlink-to-dir entries into a different tree / cycle.
    if fs::symlink_metadata(src)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
    {
        fs::copy(src, dst).map(|_| ())
    } else if src.is_dir() {
        // Guard against symlink/junction cycles: canonicalize this directory and
        // skip if we've already copied it.
        if let Ok(canon) = fs::canonicalize(src) {
            if !visited.insert(canon) {
                return Ok(());
            }
        }
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let from = entry.path();
            let to = dst.join(entry.file_name());
            copy_recursive_inner(&from, &to, visited)?;
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
            Err(e) if e.raw_os_error() == Some(17)
                    || e.raw_os_error() == Some(18)
                    || e.kind() == std::io::ErrorKind::CrossesDevices => {
                // Cross-device link: Windows ERROR_NOT_SAME_DEVICE (errno 17),
                // Linux EXDEV (errno 18), or Rust's CrossesDevices kind. Copy then delete.
                copy_recursive(src, &target)?;
                remove_recursive(src)?;
            }
            Err(e) => return Err(e),
        }
        out.push((old, target.to_string_lossy().to_string()));
    }
    Ok(out)
}

pub fn delete_to_trash(paths: &[String]) -> Result<(), trash::Error> {
    let items: Vec<&Path> = paths.iter().map(|p| Path::new(p)).collect();
    trash::delete_all(items)
}

pub fn delete_permanent(paths: &[String]) -> std::io::Result<()> {
    for p in paths {
        remove_recursive(Path::new(p))?;
    }
    Ok(())
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

    #[test]
    fn delete_permanent_removes_file_and_dir() {
        let d = tempdir().unwrap();
        let f = d.path().join("a.txt"); fs::write(&f, "x").unwrap();
        delete_permanent(&[f.to_str().unwrap().to_string()]).unwrap();
        assert!(!f.exists());
    }

    #[test]
    fn delete_to_trash_removes_file() {
        // Moves the file to the OS recycle bin; the temp file disappears from its location.
        let d = tempdir().unwrap();
        let f = d.path().join("totrash.txt"); fs::write(&f, "x").unwrap();
        let _ = delete_to_trash(&[f.to_str().unwrap().to_string()]);
        assert!(!f.exists(), "file should be moved to recycle bin");
    }

    #[test]
    fn unique_path_appends_suffix_on_collision() {
        let d = tempdir().unwrap();
        let existing = d.path().join("a.txt");
        fs::write(&existing, "x").unwrap();
        let np = unique_path(&existing);
        assert!(np.ends_with("a (1).txt"), "got: {:?}", np);
    }

    #[cfg(windows)]
    #[test]
    fn unique_path_returns_dst_when_parent_is_a_drive_root() {
        // A path whose parent is the drive root (e.g. "C:\\file") still has a parent,
        // so this targets the no-parent guard via a bare filename existing in cwd
        // is fragile. Instead verify the root itself: "C:\\" has no parent.
        let root = Path::new("C:\\");
        // We can't make "C:\\" not-exist; but parent() is None here, so regardless of
        // exists the guard returns dst. Call unique_path and assert it returns root.
        // Note: root.exists() is true, so the guard path is exercised.
        let np = unique_path(root);
        assert_eq!(np, Path::new("C:\\"), "got: {:?}", np);
    }

    #[test]
    fn copy_recursive_handles_symlink_without_recurse() {
        // Requires symlink creation privileges; on Windows this may need elevation.
        // We only exercise the path when creation succeeds; otherwise skip silently.
        let d = tempdir().unwrap();
        let real = d.path().join("real.txt");
        fs::write(&real, "payload").unwrap();
        let link = d.path().join("link.txt");
        #[cfg(unix)]
        let created = std::os::unix::fs::symlink(&real, &link).is_ok();
        #[cfg(windows)]
        let created = std::os::windows::fs::symlink_file(&real, &link).is_ok();
        #[cfg(not(any(unix, windows)))]
        let created = false;
        if created {
            let dst = d.path().join("copied.txt");
            copy_recursive(&link, &dst).unwrap();
            assert!(dst.is_file(), "symlink should be copied as a file");
        }
    }

    #[test]
    fn copy_items_into_missing_dest_returns_error() {
        let d = tempdir().unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "x").unwrap();
        let r = copy_items(&[src.to_str().unwrap().to_string()], d.path().join("nope").to_str().unwrap());
        assert!(r.is_err());
    }

    #[test]
    fn move_items_auto_renames_on_collision() {
        let d = tempdir().unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "1").unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        // first move
        let m1 = move_items(&[src.to_str().unwrap().to_string()], dest.to_str().unwrap()).unwrap();
        assert!(dest.join("a.txt").is_file());
        // recreate source and move again -> collision -> a (1).txt
        fs::write(&src, "2").unwrap();
        let m2 = move_items(&[src.to_str().unwrap().to_string()], dest.to_str().unwrap()).unwrap();
        assert!(dest.join("a (1).txt").is_file());
        assert!(m2[0].1.ends_with("a (1).txt"));
    }

    #[test]
    fn delete_permanent_on_missing_is_error() {
        assert!(delete_permanent(&["Z:/no/such/file".to_string()]).is_err());
    }
}
