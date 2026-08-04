use std::fs;
use std::io::{self, Read};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use zip::{CompressionMethod, ZipArchive, ZipWriter};
use zip::write::{ExtendedFileOptions, FileOptions};

use crate::error::Result;
use crate::ops;

static ZIP_CANCELLED: AtomicBool = AtomicBool::new(false);

/// Reset the in-flight zip/extract cancel flag (called at the start of each op).
pub fn reset_zip_cancel() {
    ZIP_CANCELLED.store(false, Ordering::SeqCst);
}

/// Set the cancel flag; the running op checks it between top-level sources.
pub fn request_zip_cancel() {
    ZIP_CANCELLED.store(true, Ordering::SeqCst);
}

/// Whether a cancel was requested for the current zip/extract operation.
pub fn is_zip_cancelled() -> bool {
    ZIP_CANCELLED.load(Ordering::SeqCst)
}

/// File options for stored entries: Deflated (requires the `deflate` feature,
/// enabled by default in zip 2.x). Compression level uses the crate default.
fn zip_options() -> FileOptions<'static, ExtendedFileOptions> {
    FileOptions::default().compression_method(CompressionMethod::Deflated)
}

/// Recursively add `path` to the archive under `entry_name` (forward-slash
/// separated, mirroring Explorer's "compress selected items" layout). Invokes
/// `on_file` once per stored file with running (current, total) counts.
/// Best-effort: per-item failures are collected into `errors` and skipped
/// instead of aborting the whole archive. Links to directories (incl. Windows
/// junctions) are skipped entirely — consistent with `ops` copy semantics.
fn add_entry(
    writer: &mut ZipWriter<fs::File>,
    path: &Path,
    entry_name: String,
    on_file: &mut dyn FnMut(usize, usize, &Path),
    current: &mut usize,
    total: usize,
    errors: &mut Vec<String>,
) -> Result<()> {
    if is_zip_cancelled() {
        return Ok(());
    }
    let meta = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) => {
            errors.push(format!("{}: {}", path.display(), e));
            return Ok(());
        }
    };
    if meta.file_type().is_symlink() {
        // Directory links (junctions) can't be stored as files — skip them
        // (they were counted as 0 by ops::count_files). File links are stored
        // as regular files (their target content).
        let target_is_dir = fs::metadata(path).map(|m| m.is_dir()).unwrap_or(true);
        if target_is_dir {
            return Ok(());
        }
        writer.start_file(&entry_name, zip_options())?;
        let mut f = match fs::File::open(path) {
            Ok(f) => f,
            Err(e) => {
                errors.push(format!("{}: {}", path.display(), e));
                return Ok(());
            }
        };
        io::copy(&mut f, writer)?;
        *current += 1;
        on_file(*current, total, path);
    } else if meta.is_dir() {
        // Directory marker entry (trailing slash).
        writer.start_file(&format!("{}/", entry_name), zip_options())?;
        let rd = match fs::read_dir(path) {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("{}: {}", path.display(), e));
                return Ok(());
            }
        };
        for child in rd {
            let child = match child {
                Ok(c) => c,
                Err(e) => {
                    errors.push(format!("{}: {}", path.display(), e));
                    continue;
                }
            };
            let cname = child.file_name().to_string_lossy().replace('\\', "/");
            add_entry(
                writer,
                &child.path(),
                format!("{}/{}", entry_name, cname),
                on_file,
                current,
                total,
                errors,
            )?;
        }
    } else {
        writer.start_file(&entry_name, zip_options())?;
        let mut f = match fs::File::open(path) {
            Ok(f) => f,
            Err(e) => {
                errors.push(format!("{}: {}", path.display(), e));
                return Ok(());
            }
        };
        io::copy(&mut f, writer)?;
        *current += 1;
        on_file(*current, total, path);
    }
    Ok(())
}

/// Compress `sources` (files and/or directories) into a zip archive at
/// `dest_zip`. Emits `on_file(current, total, path)` per file written and
/// stops early (keeping what was already written) if `is_cancelled` flips.
pub fn zip_items_tracked<F, C>(
    sources: &[String],
    dest_zip: &str,
    is_cancelled: C,
    mut on_file: F,
) -> Result<()>
where
    F: FnMut(usize, usize, &Path),
    C: Fn() -> bool,
{
    ops::validate_safe_path(dest_zip)?;
    let dest = Path::new(dest_zip);
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    let file = fs::File::create(dest)?;
    let mut writer = ZipWriter::new(file);
    let total = ops::count_files(sources);
    let mut current = 0usize;
    let mut errors = Vec::new();
    for s in sources {
        if is_cancelled() {
            break;
        }
        let src = Path::new(s);
        let root = src
            .file_name()
            .map(|n| n.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|| "item".into());
        add_entry(&mut writer, src, root, &mut on_file, &mut current, total, &mut errors)?;
    }
    writer.finish().map(|_| ())?;
    if !errors.is_empty() {
        // Best-effort archiving completed; log skipped/failed items (the IPC
        // contract returns (), so there is no error channel to the frontend).
        eprintln!("[zip] {} item(s) skipped/failed: {}", errors.len(), errors.join("; "));
    }
    // If cancelled before any file was written, don't leave an empty archive.
    if current == 0 && is_cancelled() {
        let _ = fs::remove_file(dest);
    }
    Ok(())
}

/// Maximum total decompressed bytes written by a single extraction. Guards
/// against zip-bomb archives (tiny archive expanding to fill the disk).
const MAX_EXTRACT_BYTES: u64 = 10 * 1024 * 1024 * 1024; // 10 GiB

/// Extract `zip_path` into `dest_dir` (created if missing). Hardened against
/// Zip Slip via `ZipFile::enclosed_name()` (skips entries escaping `dest_dir`)
/// and against zip bombs via `MAX_EXTRACT_BYTES`. Returns the number of files
/// written.
pub fn unzip_items_tracked<F, C>(
    zip_path: &str,
    dest_dir: &str,
    is_cancelled: C,
    mut on_file: F,
) -> Result<usize>
where
    F: FnMut(usize, usize, &Path),
    C: Fn() -> bool,
{
    ops::validate_safe_path(dest_dir)?;
    let dest = Path::new(dest_dir);
    fs::create_dir_all(dest)?;
    // Canonicalize the destination so the containment re-check below cannot be
    // redirected by a pre-planted symlink/junction inside `dest`.
    let dest_canon = fs::canonicalize(dest).unwrap_or_else(|_| dest.to_path_buf());
    let file = fs::File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)?;
    let total = archive.len() as usize;
    let mut current = 0usize;
    let mut written = 0usize;
    let mut total_bytes: u64 = 0;
    for i in 0..archive.len() {
        if is_cancelled() {
            break;
        }
        let mut entry = archive.by_index(i)?;
        // `enclosed_name` sanitizes `..` and absolute paths — returns None for
        // unsafe entries, which we skip (Zip Slip protection).
        let name = match entry.enclosed_name() {
            Some(n) => n,
            None => continue,
        };
        let outpath = dest.join(&name);
        // Defense in depth: re-confirm the resolved path stays within dest.
        if !outpath.starts_with(&dest_canon) && !outpath.starts_with(dest) {
            continue;
        }
        if entry.is_dir() {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent)?;
                // A pre-planted symlink/junction inside `dest` could redirect
                // the write outside of it; verify the resolved parent stays in.
                if let Ok(canon_parent) = fs::canonicalize(parent) {
                    if !canon_parent.starts_with(&dest_canon) {
                        continue;
                    }
                }
            }
            let mut outfile = fs::File::create(&outpath)?;
            // Zip-bomb quota: stream through `take` so actual written bytes can
            // never exceed the remaining budget (declared sizes can lie). One
            // extra byte is allowed through purely to detect the overflow.
            let remaining = MAX_EXTRACT_BYTES.saturating_sub(total_bytes);
            let n = io::copy(&mut entry.by_ref().take(remaining.saturating_add(1)), &mut outfile)?;
            total_bytes = total_bytes.saturating_add(n);
            if n > remaining {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!(
                        "refused: archive exceeds the {} GiB extraction limit (zip-bomb protection)",
                        MAX_EXTRACT_BYTES / (1024 * 1024 * 1024)
                    ),
                )
                .into());
            }
            written += 1;
        }
        current += 1;
        on_file(current, total, &outpath);
    }
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn zip_and_unzip_roundtrip() {
        let d = tempdir().unwrap();
        let srcdir = d.path().join("data");
        fs::create_dir(&srcdir).unwrap();
        fs::write(srcdir.join("a.txt"), "alpha").unwrap();
        let sub = srcdir.join("sub");
        fs::create_dir(&sub).unwrap();
        fs::write(sub.join("b.txt"), "beta").unwrap();

        let zip_path = d.path().join("out.zip");
        zip_items_tracked(
            &[srcdir.to_string_lossy().to_string()],
            zip_path.to_str().unwrap(),
            || false,
            |_, _, _| {},
        )
        .unwrap();
        assert!(zip_path.is_file());

        let extract_dir = d.path().join("extract");
        let written = unzip_items_tracked(
            zip_path.to_str().unwrap(),
            extract_dir.to_str().unwrap(),
            || false,
            |_, _, _| {},
        )
        .unwrap();
        assert_eq!(written, 2);
        assert_eq!(
            fs::read_to_string(extract_dir.join("data").join("a.txt")).unwrap(),
            "alpha"
        );
        assert_eq!(
            fs::read_to_string(extract_dir.join("data").join("sub").join("b.txt")).unwrap(),
            "beta"
        );
    }

    #[test]
    fn zip_multiple_sources_keep_names() {
        let d = tempdir().unwrap();
        let f1 = d.path().join("one.txt");
        let f2 = d.path().join("two.txt");
        fs::write(&f1, "1").unwrap();
        fs::write(&f2, "2").unwrap();
        let zip_path = d.path().join("multi.zip");
        zip_items_tracked(
            &[f1.to_string_lossy().to_string(), f2.to_string_lossy().to_string()],
            zip_path.to_str().unwrap(),
            || false,
            |_, _, _| {},
        )
        .unwrap();

        let extract_dir = d.path().join("ex");
        unzip_items_tracked(
            zip_path.to_str().unwrap(),
            extract_dir.to_str().unwrap(),
            || false,
            |_, _, _| {},
        )
        .unwrap();
        assert_eq!(fs::read_to_string(extract_dir.join("one.txt")).unwrap(), "1");
        assert_eq!(fs::read_to_string(extract_dir.join("two.txt")).unwrap(), "2");
    }

    #[test]
    fn zip_cancels_when_pre_cancelled() {
        let d = tempdir().unwrap();
        let f1 = d.path().join("a.txt");
        let f2 = d.path().join("b.txt");
        fs::write(&f1, "1").unwrap();
        fs::write(&f2, "2").unwrap();
        let zip_path = d.path().join("cancel.zip");
        // Pre-cancelled: nothing should be written, no archive created.
        zip_items_tracked(
            &[f1.to_string_lossy().to_string(), f2.to_string_lossy().to_string()],
            zip_path.to_str().unwrap(),
            || true,
            |_, _, _| {},
        )
        .unwrap();
        assert!(!zip_path.exists(), "no zip created when pre-cancelled");
    }

    #[test]
    fn unzip_skips_zip_slip_entries() {
        let d = tempdir().unwrap();
        // Craft a malicious archive with a "../escape.txt" entry.
        let zip_path = d.path().join("evil.zip");
        {
            let file = fs::File::create(&zip_path).unwrap();
            let mut writer = ZipWriter::new(file);
            writer.start_file("../escape.txt", zip_options()).unwrap();
            writer.write_all(b"pwn").unwrap();
            writer.finish().unwrap();
        }
        let extract_dir = d.path().join("safe");
        let written = unzip_items_tracked(
            zip_path.to_str().unwrap(),
            extract_dir.to_str().unwrap(),
            || false,
            |_, _, _| {},
        )
        .unwrap();
        assert_eq!(written, 0, "slip entry must be skipped");
        assert!(
            !d.path().join("escape.txt").exists(),
            "must not escape the destination directory"
        );
    }
}
