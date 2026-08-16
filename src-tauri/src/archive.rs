//! Archive dispatch: route compress/extract by file extension to the right
//! backend (zip / 7z / rar). Keeps format-specific logic in one place and lets
//! the `create_archive` / `extract_archive` commands stay thin.

use std::fs;
use std::path::Path;

use crate::error::{AppError, Result};
use crate::{ops, zip};

fn has_ext(path: &str, ext: &str) -> bool {
    path.to_ascii_lowercase().ends_with(ext)
}

/// Compress `sources` into `dest`. The destination extension picks the backend:
/// `.7z` → sevenz-rust2, otherwise zip. `is_cancelled` is checked between
/// top-level sources; `on_file(current, total, path)` fires per source.
pub fn compress_items_tracked<F, C>(
    sources: &[String],
    dest: &str,
    is_cancelled: C,
    on_file: F,
) -> Result<()>
where
    F: FnMut(usize, usize, &Path),
    C: Fn() -> bool,
{
    if has_ext(dest, ".7z") {
        compress_7z(sources, dest, is_cancelled, on_file)
    } else {
        zip::zip_items_tracked(sources, dest, is_cancelled, on_file)
    }
}

/// Compress `sources` into a 7z archive with sevenz-rust2 (solid LZMA2 by
/// default). sevenz-rust2 has no per-file progress/cancel hooks, so progress is
/// reported at the top-level source granularity and cancellation only takes
/// effect between sources.
fn compress_7z<F, C>(sources: &[String], dest: &str, is_cancelled: C, mut on_file: F) -> Result<()>
where
    F: FnMut(usize, usize, &Path),
    C: Fn() -> bool,
{
    ops::validate_safe_path(dest)?;
    let dest_path = Path::new(dest);
    if let Some(parent) = dest_path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    let total = sources.len();
    let mut writer = sevenz_rust2::ArchiveWriter::create(dest_path)
        .map_err(|e| AppError::Unknown(e.to_string()))?;
    let mut current = 0usize;
    for s in sources {
        if is_cancelled() {
            break;
        }
        // The closure filters paths inside the source tree; pass everything.
        writer
            .push_source_path(Path::new(s), |_| true)
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        current += 1;
        on_file(current, total, Path::new(s));
    }
    writer.finish()?;

    // If cancelled before any source was packed, don't leave an empty archive.
    if current == 0 && is_cancelled() {
        let _ = fs::remove_file(dest_path);
    }
    Ok(())
}

/// Extract `zip_path` into `dest_dir` (created if missing). Routes by the
/// archive's extension: `.7z` → sevenz-rust2, `.rar` → unrar-rs, else zip.
/// Returns the number of files written.
pub fn extract_items_tracked<F, C>(
    zip_path: &str,
    dest_dir: &str,
    is_cancelled: C,
    on_file: F,
) -> Result<usize>
where
    F: FnMut(usize, usize, &Path),
    C: Fn() -> bool,
{
    if has_ext(zip_path, ".7z") {
        extract_7z(zip_path, dest_dir, is_cancelled, on_file)
    } else if has_ext(zip_path, ".rar") {
        extract_rar(zip_path, dest_dir, is_cancelled, on_file)
    } else {
        zip::unzip_items_tracked(zip_path, dest_dir, is_cancelled, on_file)
    }
}

/// Extract a 7z archive. sevenz-rust2's `decompress_file` is a one-shot call
/// with no per-file progress or cancellation, so progress is reported as a
/// single coarse step.
fn extract_7z<F, C>(
    zip_path: &str,
    dest_dir: &str,
    _is_cancelled: C,
    mut on_file: F,
) -> Result<usize>
where
    F: FnMut(usize, usize, &Path),
    C: Fn() -> bool,
{
    ops::validate_safe_path(dest_dir)?;
    let dest = Path::new(dest_dir);
    fs::create_dir_all(dest)?;
    sevenz_rust2::decompress_file(zip_path, dest)
        .map_err(|e| AppError::Unknown(e.to_string()))?;
    on_file(1, 1, dest);
    // We can't cheaply count extracted files; report 1 to signal success.
    Ok(1)
}

/// Extract a RAR archive member-by-member. unrar-rs already sanitizes member
/// names (path traversal protection) and reports directory entries via
/// `is_directory`, so we just create parents and extract each file.
fn extract_rar<F, C>(
    zip_path: &str,
    dest_dir: &str,
    is_cancelled: C,
    mut on_file: F,
) -> Result<usize>
where
    F: FnMut(usize, usize, &Path),
    C: Fn() -> bool,
{
    use unrar_rs::{ExtractOptions, RarArchive};

    ops::validate_safe_path(dest_dir)?;
    let dest = Path::new(dest_dir);
    fs::create_dir_all(dest)?;

    let file = fs::File::open(zip_path)?;
    let mut archive = RarArchive::open(file).map_err(|e| AppError::Unknown(e.to_string()))?;
    let members = archive.metadata().members.clone();
    let total = members.len();
    let mut written = 0usize;
    for (i, member) in members.iter().enumerate() {
        if is_cancelled() {
            break;
        }
        let outpath = dest.join(&member.name);
        if member.is_directory {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent)?;
            }
            let opts = ExtractOptions {
                verify: true,
                password: None,
                restore_owners: false,
            };
            archive
                .extract_member_to_file(i, &opts, None, &outpath)
                .map_err(|e| AppError::Unknown(e.to_string()))?;
            written += 1;
        }
        on_file(i + 1, total, &outpath);
    }
    Ok(written)
}


#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn compress_7z_creates_archive() {
        let d = tempdir().unwrap();
        let f1 = d.path().join("a.txt");
        fs::write(&f1, "hello 7z").unwrap();
        let dest = d.path().join("out.7z");
        compress_items_tracked(
            &[f1.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
            || false,
            |_, _, _| {},
        )
        .unwrap();
        assert!(dest.is_file());
        assert!(fs::metadata(&dest).unwrap().len() > 0);
    }

    #[test]
    fn compress_zip_still_routes_to_zip() {
        let d = tempdir().unwrap();
        let f1 = d.path().join("a.txt");
        fs::write(&f1, "hello zip").unwrap();
        let dest = d.path().join("out.zip");
        compress_items_tracked(
            &[f1.to_string_lossy().to_string()],
            dest.to_str().unwrap(),
            || false,
            |_, _, _| {},
        )
        .unwrap();
        assert!(dest.is_file());
    }
}

