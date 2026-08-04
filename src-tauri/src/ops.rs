use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

/// Global cancel flag for the in-flight tracked copy. Set by `request_copy_cancel`
/// (the Cancel button), checked between top-level sources in `copy_items_tracked`.
/// A single flag suffices: concurrent tracked copies are not supported (rare).
static COPY_CANCELLED: AtomicBool = AtomicBool::new(false);

/// Security: validate that `path` does not target a Windows system-critical
/// directory. Blocks destructive operations (delete_permanent, rename, overwrite)
/// against C:\Windows, C:\Windows\System32, C:\Program Files, and the root of
/// the system drive. These paths can brick the OS if removed/renamed.
///
/// Non-destructive operations (list_directory, search, get_properties) are
/// allowed on any path — they don't modify the filesystem.
pub(crate) fn validate_safe_path(path: &str) -> std::io::Result<()> {
    let p = Path::new(path);

    // Reject empty paths.
    if p.as_os_str().is_empty() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "path is empty",
        ));
    }

    // On Windows, check against known system directories (case-insensitive).
    #[cfg(windows)]
    {
        let canon = fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
        let lower = canon.to_string_lossy().to_lowercase();
        let blocked = [
            "c:\\windows",
            "c:\\windows\\system32",
            "c:\\windows\\syswow64",
            "c:\\program files",
            "c:\\program files (x86)",
            "c:\\programdata",
            "c:\\$recycle.bin",
            "c:\\boot",
            "c:\\recovery",
            "c:\\system volume information",
        ];
        for b in &blocked {
            if lower == *b || lower.starts_with(&format!("{}\\", b)) {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    format!("refused: path is a protected system directory: {}", b),
                ));
            }
        }
        // Block the root of the system drive itself.
        if lower == "c:\\" || lower == "c:" {
            return Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "refused: cannot operate on system drive root",
            ));
        }
    }

    Ok(())
}

/// Validate that a path is safe for destructive operations (delete, rename, overwrite).
/// Uses `validate_safe_path` and also blocks the recycle bin root.
fn validate_destructive_path(path: &str) -> std::io::Result<()> {
    validate_safe_path(path)?;
    // Also block the trash root — deleting it corrupts the recycle bin.
    #[cfg(windows)]
    {
        let p = Path::new(path);
        let canon = fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
        let lower = canon.to_string_lossy().to_lowercase();
        if lower.contains("$recycle.bin") && lower.matches('\\').count() <= 1 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "refused: cannot delete recycle bin root",
            ));
        }
    }
    Ok(())
}

pub fn reset_copy_cancel() {
    COPY_CANCELLED.store(false, Ordering::SeqCst);
}

pub fn request_copy_cancel() {
    COPY_CANCELLED.store(true, Ordering::SeqCst);
}

pub fn is_copy_cancelled() -> bool {
    COPY_CANCELLED.load(Ordering::SeqCst)
}

/// How to handle a name collision when copying/moving into a destination that
/// already contains an item of the same name. Mirrors the Win11 "Replace or
/// skip files" conflict dialog.
#[derive(Clone, Copy, serde::Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum ConflictStrategy {
    /// Keep both: auto-rename the incoming item ("name (1)"). Existing behavior.
    Rename,
    /// Overwrite the existing item (remove it first, then copy/move).
    Replace,
    /// Leave the existing item untouched; do not copy/move this source.
    Skip,
}

/// Result of a tracked copy operation: the created paths plus the original
/// paths of items sent to the recycle bin during Replace. `errors` collects
/// per-file failures (e.g. access denied) — the operation is best-effort and
/// no longer aborts the whole batch on the first bad item.
#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrackedCopyResult {
    pub paths: Vec<String>,
    pub trashed: Vec<String>,
    pub errors: Vec<String>,
}

/// Result of a tracked move operation: (old, new) pairs plus the original
/// paths of items sent to the recycle bin during Replace. See
/// `TrackedCopyResult.errors` for the per-file failure semantics.
#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrackedMoveResult {
    pub pairs: Vec<(String, String)>,
    pub trashed: Vec<String>,
    pub errors: Vec<String>,
}

/// A source name that already exists in the destination (a collision).
#[derive(serde::Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConflictInfo {
    pub name: String,
}

/// Report which of `sources` have a same-named item already present in `dest_dir`.
pub fn check_conflicts(sources: &[String], dest_dir: &str) -> Vec<ConflictInfo> {
    let dest = Path::new(dest_dir);
    sources
        .iter()
        .filter_map(|s| {
            let src = Path::new(s);
            let name = src.file_name()?;
            if dest.join(name).exists() {
                Some(ConflictInfo { name: name.to_string_lossy().to_string() })
            } else {
                None
            }
        })
        .collect()
}

/// Resolve the destination path for `src` under `dest` given a conflict strategy.
/// Returns `None` when the strategy is Skip and a collision exists.
fn resolve_target(src: &Path, dest: &Path, strategy: ConflictStrategy) -> Option<PathBuf> {
    let name = src.file_name()?;
    let direct = dest.join(name);
    match strategy {
        ConflictStrategy::Skip if direct.exists() => None,
        ConflictStrategy::Rename => Some(unique_path(&direct)),
        ConflictStrategy::Skip | ConflictStrategy::Replace => Some(direct),
    }
}

pub fn create_dir(path: &str) -> std::io::Result<()> {
    fs::create_dir(Path::new(path))
}

pub fn create_file(path: &str) -> std::io::Result<()> {
    fs::File::create(Path::new(path))?;
    Ok(())
}

pub fn rename(from: &str, to: &str) -> std::io::Result<()> {
    validate_destructive_path(from)?;
    validate_safe_path(to)?;
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

fn never_cancel() -> bool {
    false
}

fn copy_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    let mut errors = Vec::new();
    copy_recursive_tracked(
        src,
        dst,
        &mut std::collections::HashSet::new(),
        &mut |_| {},
        &never_cancel,
        &mut errors,
    )?;
    // Best-effort semantics: every file was attempted; surface failures after
    // the fact instead of aborting the batch midway.
    if errors.is_empty() {
        Ok(())
    } else {
        Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("{} item(s) failed: {}", errors.len(), errors.join("; ")),
        ))
    }
}

/// Whether `src` is a link (symlink or Windows junction) whose target is a
/// directory. Such links are SKIPPED during copy/zip: recursing into them
/// risks cycles, and `fs::copy` on a directory junction fails outright
/// (previously aborting the whole operation).
fn is_dir_link(src: &Path) -> bool {
    fs::symlink_metadata(src)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
        && fs::metadata(src).map(|m| m.is_dir()).unwrap_or(false)
}

fn copy_recursive_tracked(
    src: &Path,
    dst: &Path,
    visited: &mut std::collections::HashSet<PathBuf>,
    on_file: &mut dyn FnMut(&Path),
    is_cancelled: &dyn Fn() -> bool,
    errors: &mut Vec<String>,
) -> std::io::Result<()> {
    if is_cancelled() {
        return Ok(());
    }
    let lmeta = match fs::symlink_metadata(src) {
        Ok(m) => m,
        Err(e) => {
            errors.push(format!("{}: {}", src.display(), e));
            return Ok(());
        }
    };
    if lmeta.file_type().is_symlink() {
        // Link handling: a link to a FILE is copied as a single unit (the
        // target's content). A link to a DIRECTORY (incl. junctions) is
        // skipped — it was counted as 0 by `count_files_in`.
        if is_dir_link(src) || fs::metadata(src).is_err() {
            return Ok(());
        }
        on_file(src);
        if let Err(e) = fs::copy(src, dst) {
            errors.push(format!("{}: {}", src.display(), e));
        }
        return Ok(());
    }
    if lmeta.is_dir() {
        // Guard against symlink/junction cycles: canonicalize this directory and
        // skip if we've already copied it.
        if let Ok(canon) = fs::canonicalize(src) {
            if !visited.insert(canon) {
                return Ok(());
            }
        }
        if let Err(e) = fs::create_dir_all(dst) {
            errors.push(format!("{}: {}", dst.display(), e));
            return Ok(());
        }
        let rd = match fs::read_dir(src) {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("{}: {}", src.display(), e));
                return Ok(());
            }
        };
        for entry in rd {
            if is_cancelled() {
                return Ok(()); // Cancel pressed mid-folder: stop, keep what's copied.
            }
            let entry = match entry {
                Ok(en) => en,
                Err(e) => {
                    errors.push(format!("{}: {}", src.display(), e));
                    continue;
                }
            };
            let from = entry.path();
            let to = dst.join(entry.file_name());
            copy_recursive_tracked(&from, &to, visited, on_file, is_cancelled, errors)?;
        }
        Ok(())
    } else {
        on_file(src);
        if let Err(e) = fs::copy(src, dst) {
            errors.push(format!("{}: {}", src.display(), e));
        }
        Ok(())
    }
}

/// Count the files that copying `sources` would write (files only, not dirs).
/// Matches `copy_recursive_tracked` semantics: a link to a file counts as one
/// unit, a directory link (junction) is skipped (0), a directory counts its
/// descendants recursively.
fn count_files_in(p: &Path) -> usize {
    let lmeta = match fs::symlink_metadata(p) {
        Ok(m) => m,
        Err(_) => return 0,
    };
    if lmeta.file_type().is_symlink() {
        if is_dir_link(p) || fs::metadata(p).is_err() {
            0
        } else {
            1
        }
    } else if lmeta.is_dir() {
        match fs::read_dir(p) {
            Ok(rd) => rd
                .filter_map(|e| e.ok())
                .map(|e| count_files_in(&e.path()))
                .sum(),
            Err(_) => 0,
        }
    } else {
        1
    }
}

pub fn count_files(sources: &[String]) -> usize {
    sources.iter().map(|s| count_files_in(Path::new(s))).sum()
}

/// Like `copy_items_with_strategy`, but invokes `on_file(current, total, path)`
/// as each file is written — used to drive a progress indicator. `is_cancelled`
/// is polled between top-level sources; returning true stops the copy early.
/// Also returns the original paths of items trashed during Replace, so the
/// frontend can restore them on undo.
pub fn copy_items_tracked<F, C>(
    sources: &[String],
    dest_dir: &str,
    strategy: ConflictStrategy,
    is_cancelled: C,
    mut on_file: F,
) -> std::io::Result<TrackedCopyResult>
where
    F: FnMut(usize, usize, &Path),
    C: Fn() -> bool,
{
    let dest = Path::new(dest_dir);
    let total = count_files(sources);
    let mut current = 0usize;
    let mut out = Vec::new();
    let mut trashed = Vec::new();
    let mut errors = Vec::new();
    for s in sources {
        if is_cancelled() {
            break; // Cancel pressed: stop, keep files copied so far.
        }
        let src = Path::new(s);
        let target = match resolve_target(src, dest, strategy) {
            Some(t) => t,
            None => continue, // Skip + collision → skip this source
        };
        if strategy == ConflictStrategy::Replace && target.exists() {
            // Record the original path before trashing so undo can restore it.
            trashed.push(target.to_string_lossy().to_string());
            trash_path(&target)?;
        }
        copy_recursive_tracked(
            src,
            &target,
            &mut std::collections::HashSet::new(),
            &mut |p| {
                current += 1;
                on_file(current, total, p);
            },
            &is_cancelled,
            &mut errors,
        )?;
        out.push(target.to_string_lossy().to_string());
    }
    Ok(TrackedCopyResult { paths: out, trashed, errors })
}

/// Like `move_items_with_strategy`, but for cross-volume moves (copy+delete) it
/// emits per-file progress via `on_file` and honors `is_cancelled` between
/// sources. Same-volume moves are instant renames (no per-file progress).
/// Also returns the original paths of items trashed during Replace.
pub fn move_items_tracked<F, C>(
    sources: &[String],
    dest_dir: &str,
    strategy: ConflictStrategy,
    is_cancelled: C,
    mut on_file: F,
) -> std::io::Result<TrackedMoveResult>
where
    F: FnMut(usize, usize, &Path),
    C: Fn() -> bool,
{
    let dest = Path::new(dest_dir);
    let total = count_files(sources);
    let mut current = 0usize;
    let mut out = Vec::new();
    let mut trashed = Vec::new();
    let mut errors = Vec::new();
    for s in sources {
        if is_cancelled() {
            break;
        }
        let src = Path::new(s);
        let target = match resolve_target(src, dest, strategy) {
            Some(t) => t,
            None => continue,
        };
        if strategy == ConflictStrategy::Replace && target.exists() {
            trashed.push(target.to_string_lossy().to_string());
            trash_path(&target)?;
        }
        let old = src.to_string_lossy().to_string();
        match fs::rename(src, &target) {
            Ok(()) => {}
            Err(e) if e.raw_os_error() == Some(17)
                    || e.raw_os_error() == Some(18)
                    || e.kind() == std::io::ErrorKind::CrossesDevices => {
                // Cross-device: tracked copy (emits progress) then delete the source.
                let before = errors.len();
                copy_recursive_tracked(
                    src,
                    &target,
                    &mut std::collections::HashSet::new(),
                    &mut |p| {
                        current += 1;
                        on_file(current, total, p);
                    },
                    &is_cancelled,
                    &mut errors,
                )?;
                // Safety: only delete the source when the copy was clean or the
                // user cancelled; a partially-failed copy keeps the source intact.
                if errors.len() == before && !is_cancelled() {
                    if let Err(e) = remove_recursive(src) {
                        errors.push(format!("{}: {}", src.display(), e));
                    }
                } else if errors.len() != before {
                    errors.push(format!(
                        "{}: source kept because the copy was incomplete",
                        src.display()
                    ));
                }
            }
            Err(e) => {
                // Per-item failure: record and continue with the remaining sources.
                errors.push(format!("{}: {}", src.display(), e));
                continue;
            }
        }
        out.push((old, target.to_string_lossy().to_string()));
    }
    Ok(TrackedMoveResult { pairs: out, trashed, errors })
}

fn remove_recursive(p: &Path) -> std::io::Result<()> {
    if p.is_dir() { fs::remove_dir_all(p) } else { fs::remove_file(p) }
}

/// Send `p` to the OS recycle bin (recoverable), mapping the trash error to
/// an io::Error. Used by the `Replace` strategy so an overwritten item is NOT
/// permanently lost — undo can't auto-restore it, but the user can recover it
/// from the recycle bin.
fn trash_path(p: &Path) -> std::io::Result<()> {
    trash::delete(p).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
}

/// Copy each source into `dest_dir` (auto-renaming on collision). Returns the resulting paths.
pub fn copy_items(sources: &[String], dest_dir: &str) -> std::io::Result<Vec<String>> {
    copy_items_with_strategy(sources, dest_dir, ConflictStrategy::Rename)
}

/// Copy each source into `dest_dir` honoring `strategy` on collision. Returns the
/// resulting (new) paths — skipped sources contribute nothing.
pub fn copy_items_with_strategy(
    sources: &[String],
    dest_dir: &str,
    strategy: ConflictStrategy,
) -> std::io::Result<Vec<String>> {
    let dest = Path::new(dest_dir);
    let mut out = Vec::new();
    for s in sources {
        let src = Path::new(s);
        let target = match resolve_target(src, dest, strategy) {
            Some(t) => t,
            None => continue, // Skip + collision → skip this source
        };
        // Replace: send the existing target to the recycle bin (recoverable) so
        // the copy can overwrite it without permanently losing the original.
        if strategy == ConflictStrategy::Replace && target.exists() {
            trash_path(&target)?;
        }
        copy_recursive(src, &target)?;
        out.push(target.to_string_lossy().to_string());
    }
    Ok(out)
}

/// Move each source into `dest_dir` (same-volume = rename; cross-volume = copy+delete).
/// Returns Vec<(old_path, new_path)>.
pub fn move_items(sources: &[String], dest_dir: &str) -> std::io::Result<Vec<(String, String)>> {
    move_items_with_strategy(sources, dest_dir, ConflictStrategy::Rename)
}

/// Move each source into `dest_dir` honoring `strategy` on collision. Returns
/// Vec<(old_path, new_path)> for sources actually moved (skipped sources excluded).
pub fn move_items_with_strategy(
    sources: &[String],
    dest_dir: &str,
    strategy: ConflictStrategy,
) -> std::io::Result<Vec<(String, String)>> {
    let dest = Path::new(dest_dir);
    let mut out = Vec::new();
    for s in sources {
        let src = Path::new(s);
        let target = match resolve_target(src, dest, strategy) {
            Some(t) => t,
            None => continue, // Skip + collision → skip this source
        };
        if strategy == ConflictStrategy::Replace && target.exists() {
            trash_path(&target)?;
        }
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

/// Send paths to the OS recycle bin. Subject to the same system-directory
/// guard as `delete_permanent` (defense-in-depth: trashing C:\Windows\… is
/// nearly as harmful as deleting it outright).
pub fn delete_to_trash(paths: &[String]) -> std::io::Result<()> {
    for p in paths {
        validate_destructive_path(p)?;
    }
    let items: Vec<&Path> = paths.iter().map(|p| Path::new(p)).collect();
    trash::delete_all(items).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
}

/// Restore items from the recycle bin to their original paths. Each path in
/// `original_paths` is matched against the `original_path` field of items
/// currently in the trash; the most recently deleted match is restored.
/// This enables undo of delete-to-trash and Replace-mode paste.
pub fn restore_from_trash(original_paths: &[String]) -> Result<(), trash::Error> {
    let trash_items = trash::os_limited::list()?;
    for path_str in original_paths {
        let target = Path::new(path_str);
        // Find the trash item whose original_path matches. If multiple items
        // share the same original path (deleted multiple times), restore the
        // most recently deleted one — that's the one we just trashed.
        let candidate = trash_items
            .iter()
            .filter(|item| item.original_path() == target)
            .max_by_key(|item| item.time_deleted);

        if let Some(item) = candidate {
            // If the original path already exists (e.g. undo of a Replace paste
            // where the pasted file wasn't removed yet), skip restoration to
            // avoid a collision — the caller should delete the pasted file first.
            if target.exists() {
                continue;
            }
            trash::os_limited::restore_all([item.clone()])?;
        }
    }
    Ok(())
}

/// Delete to trash and return the original paths, so the frontend can push
/// an undo entry that calls `restore_from_trash` with the same paths.
/// Guarded by `validate_destructive_path` like every other destructive op.
pub fn delete_to_trash_undoable(paths: &[String]) -> std::io::Result<Vec<String>> {
    for p in paths {
        validate_destructive_path(p)?;
    }
    // Record which paths actually exist (trash::delete_all fails on missing).
    let valid: Vec<&Path> = paths.iter().map(|p| Path::new(p)).filter(|p| p.exists()).collect();
    let original_paths: Vec<String> = valid.iter().map(|p| p.to_string_lossy().to_string()).collect();
    trash::delete_all(valid).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
    Ok(original_paths)
}

pub fn delete_permanent(paths: &[String]) -> std::io::Result<()> {
    for p in paths {
        validate_destructive_path(p)?;
    }
    for p in paths {
        remove_recursive(Path::new(p))?;
    }
    Ok(())
}

/// Open a terminal at `path`. Prefers Windows Terminal (wt.exe); falls back to cmd.
/// Security: validates the path exists and is a directory before spawning.
pub fn open_in_terminal(path: &str) -> std::io::Result<()> {
    use std::process::Command;
    let p = Path::new(path);
    if !p.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "terminal target is not a directory",
        ));
    }
    if Command::new("wt.exe").arg("-d").arg(path).spawn().is_ok() {
        return Ok(());
    }
    Command::new("cmd").arg("/K").current_dir(path).spawn().map(|_| ())
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
    #[ignore = "requires recycle bin access (blocked by sandbox)"]
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
        let _m1 = move_items(&[src.to_str().unwrap().to_string()], dest.to_str().unwrap()).unwrap();
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

    #[test]
    fn check_conflicts_reports_only_colliding_names() {
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        fs::write(dest.join("a.txt"), "old").unwrap();
        let src_a = d.path().join("a.txt"); fs::write(&src_a, "new").unwrap();
        let src_b = d.path().join("b.txt"); fs::write(&src_b, "x").unwrap();
        let conflicts = check_conflicts(
            &[src_a.to_string_lossy().to_string(), src_b.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
        );
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].name, "a.txt");
    }

    #[test]
    fn check_conflicts_empty_when_no_collision() {
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "x").unwrap();
        let conflicts = check_conflicts(&[src.to_string_lossy().to_string()], dest.to_str().unwrap());
        assert!(conflicts.is_empty());
    }

    #[test]
    #[ignore = "requires recycle bin access (blocked by sandbox)"]
    fn copy_with_strategy_replace_overwrites_existing() {
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        fs::write(dest.join("a.txt"), "EXISTING").unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "NEW").unwrap();
        let out = copy_items_with_strategy(
            &[src.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
            ConflictStrategy::Replace,
        ).unwrap();
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "NEW");
        assert_eq!(out.len(), 1);
        assert!(out[0].ends_with("a.txt"));
    }

    #[test]
    fn copy_with_strategy_skip_leaves_existing_untouched() {
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        fs::write(dest.join("a.txt"), "EXISTING").unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "NEW").unwrap();
        let out = copy_items_with_strategy(
            &[src.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
            ConflictStrategy::Skip,
        ).unwrap();
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "EXISTING");
        assert!(out.is_empty(), "skipped source contributes no result path");
    }

    #[test]
    fn copy_with_strategy_skip_copies_when_no_collision() {
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "NEW").unwrap();
        let out = copy_items_with_strategy(
            &[src.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
            ConflictStrategy::Skip,
        ).unwrap();
        assert!(dest.join("a.txt").is_file());
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "NEW");
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn copy_with_strategy_rename_keeps_both() {
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        fs::write(dest.join("a.txt"), "EXISTING").unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "NEW").unwrap();
        let out = copy_items_with_strategy(
            &[src.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
            ConflictStrategy::Rename,
        ).unwrap();
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "EXISTING");
        assert!(dest.join("a (1).txt").is_file());
        assert_eq!(fs::read_to_string(dest.join("a (1).txt")).unwrap(), "NEW");
        assert!(out[0].ends_with("a (1).txt"));
    }

    #[test]
    #[ignore = "requires recycle bin access (blocked by sandbox)"]
    fn move_with_strategy_replace_overwrites_and_removes_source() {
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        fs::write(dest.join("a.txt"), "EXISTING").unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "NEW").unwrap();
        let out = move_items_with_strategy(
            &[src.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
            ConflictStrategy::Replace,
        ).unwrap();
        assert!(!src.exists(), "source must be moved away");
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "NEW");
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn copy_items_default_still_auto_renames() {
        // The default wrapper must preserve original behavior (Rename strategy).
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        fs::write(dest.join("a.txt"), "EXISTING").unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "NEW").unwrap();
        let out = copy_items(&[src.to_string_lossy().to_string()], dest.to_str().unwrap()).unwrap();
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "EXISTING");
        assert!(dest.join("a (1).txt").is_file());
        assert!(out[0].ends_with("a (1).txt"));
    }

    #[test]
    fn count_files_counts_files_and_dir_descendants() {
        let d = tempdir().unwrap();
        let f1 = d.path().join("a.txt"); fs::write(&f1, "x").unwrap();
        let sub = d.path().join("sub"); fs::create_dir(&sub).unwrap();
        fs::write(sub.join("c.txt"), "z").unwrap();
        fs::write(sub.join("d.txt"), "w").unwrap();
        // f1 = 1 file; sub dir = 2 files inside → total 3
        assert_eq!(
            count_files(&[f1.to_string_lossy().to_string(), sub.to_string_lossy().to_string()]),
            3
        );
    }

    #[test]
    fn count_files_empty_dir_counts_zero() {
        let d = tempdir().unwrap();
        let sub = d.path().join("empty"); fs::create_dir(&sub).unwrap();
        assert_eq!(count_files(&[sub.to_string_lossy().to_string()]), 0);
    }

    #[test]
    fn copy_items_tracked_invokes_callback_per_file_with_running_totals() {
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        let sub = d.path().join("sub"); fs::create_dir(&sub).unwrap();
        fs::write(sub.join("a.txt"), "1").unwrap();
        fs::write(sub.join("b.txt"), "2").unwrap();
        let mut calls: Vec<(usize, usize, String)> = Vec::new();
        let result = copy_items_tracked(
            &[sub.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
            ConflictStrategy::Rename,
            || false,
            |cur, total, p| {
                calls.push((cur, total, p.file_name().unwrap().to_string_lossy().to_string()));
            },
        )
        .unwrap();
        assert_eq!(result.paths.len(), 1);
        assert_eq!(calls.len(), 2, "one callback per file copied");
        assert!(calls.iter().all(|(_, t, _)| *t == 2), "total is constant");
        assert_eq!(calls[0].0, 1);
        assert_eq!(calls[1].0, 2);
        assert!(dest.join("sub").join("a.txt").is_file());
        assert!(dest.join("sub").join("b.txt").is_file());
    }

    #[test]
    fn copy_items_tracked_stops_immediately_when_pre_cancelled() {
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        let s1 = d.path().join("a.txt"); fs::write(&s1, "1").unwrap();
        let s2 = d.path().join("b.txt"); fs::write(&s2, "2").unwrap();
        // `is_cancelled` always true → the loop breaks before copying anything.
        let result = copy_items_tracked(
            &[s1.to_string_lossy().to_string(), s2.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
            ConflictStrategy::Rename,
            || true,
            |_, _, _| {},
        )
        .unwrap();
        assert!(result.paths.is_empty(), "pre-cancelled → nothing copied");
        assert!(!dest.join("a.txt").exists());
    }

    #[test]
    fn copy_items_tracked_cancels_between_sources() {
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        let s1 = d.path().join("a.txt"); fs::write(&s1, "1").unwrap();
        let s2 = d.path().join("b.txt"); fs::write(&s2, "2").unwrap();
        // Flip a local flag while copying the first source; the loop breaks before s2.
        let cancelled = std::cell::Cell::new(false);
        let result = copy_items_tracked(
            &[s1.to_string_lossy().to_string(), s2.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
            ConflictStrategy::Rename,
            || cancelled.get(),
            |_, _, _| { cancelled.set(true); },
        )
        .unwrap();
        assert_eq!(result.paths.len(), 1, "first source copied, then cancelled");
        assert!(dest.join("a.txt").is_file());
        assert!(!dest.join("b.txt").exists(), "second source not copied after cancel");
    }

    #[test]
    fn move_items_tracked_moves_same_volume_without_progress_callbacks() {
        // Same-volume move is an instant rename: no per-file progress is emitted.
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "x").unwrap();
        let mut calls = 0usize;
        let moved = move_items_tracked(
            &[src.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
            ConflictStrategy::Rename,
            || false,
            |_, _, _| { calls += 1; },
        )
        .unwrap();
        assert!(!src.exists());
        assert!(dest.join("a.txt").is_file());
        assert_eq!(moved.pairs.len(), 1);
        assert_eq!(calls, 0, "same-volume rename emits no per-file progress");
    }

    #[test]
    fn copy_items_tracked_cancels_mid_folder_copy() {
        // Cancel threaded into recursion: after the first file, the rest are skipped.
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        let sub = d.path().join("sub"); fs::create_dir(&sub).unwrap();
        fs::write(sub.join("a.txt"), "1").unwrap();
        fs::write(sub.join("b.txt"), "2").unwrap();
        let cancelled = std::cell::Cell::new(false);
        let result = copy_items_tracked(
            &[sub.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
            ConflictStrategy::Rename,
            || cancelled.get(),
            |_, _, _| { cancelled.set(true); }, // request cancel once the first file is written
        )
        .unwrap();
        assert_eq!(result.paths.len(), 1); // the folder recorded (partially copied)
        let copied = ["a.txt", "b.txt"].into_iter().filter(|n| dest.join("sub").join(n).is_file()).count();
        assert_eq!(copied, 1, "exactly one file copied before cancel (order-independent)");
    }

    #[test]
    #[ignore = "requires recycle bin access (blocked by sandbox)"]
    fn copy_items_tracked_replace_records_trashed_paths() {
        let d = tempdir().unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        fs::write(dest.join("a.txt"), "EXISTING").unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "NEW").unwrap();
        let result = copy_items_tracked(
            &[src.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
            ConflictStrategy::Replace,
            || false,
            |_, _, _| {},
        )
        .unwrap();
        assert_eq!(result.paths.len(), 1);
        assert_eq!(result.trashed.len(), 1, "trashed path should be recorded");
        assert!(result.trashed[0].ends_with("a.txt"));
        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "NEW");
    }
}
