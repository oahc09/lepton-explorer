//! Archive dispatch: route compress/extract by file extension to the right
//! backend (zip / 7z / rar / tar). Keeps format-specific logic in one place and
//! lets the `create_archive` / `extract_archive` commands stay thin.

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
    } else if has_ext(dest, ".tar.gz") || has_ext(dest, ".tgz") {
        compress_tar(sources, dest, true, is_cancelled, on_file)
    } else if has_ext(dest, ".tar") {
        compress_tar(sources, dest, false, is_cancelled, on_file)
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
    } else if has_ext(zip_path, ".tar.gz") || has_ext(zip_path, ".tgz") {
        extract_tar(zip_path, dest_dir, true, is_cancelled, on_file)
    } else if has_ext(zip_path, ".tar") {
        extract_tar(zip_path, dest_dir, false, is_cancelled, on_file)
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

// ---------------------------------------------------------------------------
// TAR (.tar / .tar.gz / .tgz)
// ---------------------------------------------------------------------------

/// Open `path` as a tar archive (transparently gunzipping when `gzip`) and hand
/// it to `f`. A boxed reader lets the gzip / non-gzip branches share one code
/// path instead of duplicating the extraction logic.
fn with_tar<T>(
    path: &str,
    gzip: bool,
    f: impl FnOnce(&mut tar::Archive<Box<dyn std::io::Read>>) -> Result<T>,
) -> Result<T> {
    use flate2::read::GzDecoder;

    let file = fs::File::open(path)?;
    let reader: Box<dyn std::io::Read> = if gzip {
        Box::new(GzDecoder::new(file))
    } else {
        Box::new(file)
    };
    let mut ar = tar::Archive::new(reader);
    f(&mut ar)
}

/// Zip-Slip guard: an entry is safe only if it carries no absolute prefix,
/// drive prefix, or `..` component that could escape the destination.
fn tar_entry_is_safe(rel: &Path) -> bool {
    use std::path::Component;
    !rel.components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    })
}

/// Extract a tar (optionally gzipped) archive into `dest_dir`. Entries are
/// counted in a first pass so the progress dialog can show a real total, then
/// unpacked one by one so cancellation takes effect between entries.
fn extract_tar<F, C>(
    path: &str,
    dest_dir: &str,
    gzip: bool,
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

    let total = with_tar(path, gzip, |ar| {
        let mut n = 0usize;
        for e in ar.entries().map_err(|e| AppError::Unknown(e.to_string()))? {
            e.map_err(|e| AppError::Unknown(e.to_string()))?;
            n += 1;
        }
        Ok(n)
    })?;

    with_tar(path, gzip, |ar| {
        let mut written = 0usize;
        let entries = ar.entries().map_err(|e| AppError::Unknown(e.to_string()))?;
        for entry in entries {
            if is_cancelled() {
                break;
            }
            let mut entry = entry.map_err(|e| AppError::Unknown(e.to_string()))?;
            // `tar` refuses `..` paths when reading an entry. Treat that — and
            // anything our own guard dislikes — as "skip this entry" so one
            // malicious member can't fail the whole extraction.
            let rel = match entry.path() {
                Ok(p) => p.into_owned(),
                Err(_) => continue,
            };
            if !tar_entry_is_safe(&rel) {
                continue;
            }
            // Symlink/hardlink members get the same guard applied to their
            // target: a link pointing outside the destination could otherwise
            // let later entries write through it and escape the archive.
            match entry.link_name() {
                Ok(Some(link)) if !tar_entry_is_safe(&link) => continue,
                Err(_) => continue,
                _ => {}
            }
            let out = dest.join(&rel);
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent)?;
            }
            entry
                .unpack(&out)
                .map_err(|e| AppError::Unknown(e.to_string()))?;
            written += 1;
            on_file(written, total, &out);
        }
        Ok(written)
    })
}

/// Append `sources` to a tar builder, reporting progress per top-level source.
fn append_sources<W: std::io::Write, F, C>(
    builder: &mut tar::Builder<W>,
    sources: &[String],
    is_cancelled: C,
    on_file: &mut F,
) -> Result<usize>
where
    F: FnMut(usize, usize, &Path),
    C: Fn() -> bool,
{
    let total = sources.len();
    let mut current = 0usize;
    for s in sources {
        if is_cancelled() {
            break;
        }
        let src = Path::new(s);
        let name = src
            .file_name()
            .ok_or_else(|| AppError::Unknown(format!("invalid source path: {s}")))?
            .to_string_lossy()
            .to_string();
        if src.is_dir() {
            builder
                .append_dir_all(&name, src)
                .map_err(|e| AppError::Unknown(e.to_string()))?;
        } else {
            builder
                .append_path_with_name(src, &name)
                .map_err(|e| AppError::Unknown(e.to_string()))?;
        }
        current += 1;
        on_file(current, total, src);
    }
    Ok(current)
}

/// Compress `sources` into a tar archive at `dest`, gzipping when `gzip`.
fn compress_tar<F, C>(
    sources: &[String],
    dest: &str,
    gzip: bool,
    is_cancelled: C,
    mut on_file: F,
) -> Result<()>
where
    F: FnMut(usize, usize, &Path),
    C: Fn() -> bool,
{
    use flate2::{write::GzEncoder, Compression};

    ops::validate_safe_path(dest)?;
    let dest_path = Path::new(dest);
    if let Some(parent) = dest_path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    let file = fs::File::create(dest_path)?;
    let packed = if gzip {
        let mut builder = tar::Builder::new(GzEncoder::new(file, Compression::default()));
        let n = append_sources(&mut builder, sources, &is_cancelled, &mut on_file)?;
        // into_inner + finish flushes the gzip trailer; skipping it leaves a
        // truncated archive that most tools reject.
        let enc = builder
            .into_inner()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        enc.finish().map_err(|e| AppError::Unknown(e.to_string()))?;
        n
    } else {
        let mut builder = tar::Builder::new(file);
        let n = append_sources(&mut builder, sources, &is_cancelled, &mut on_file)?;
        builder
            .finish()
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        n
    };

    // Don't leave an empty or half-written archive behind: `finish()` ran
    // above, so a cancelled run produced a *valid* archive that is silently
    // missing entries — delete it just like a cancelled-before-first-entry run.
    if packed == 0 || is_cancelled() {
        let _ = fs::remove_file(dest_path);
    }
    Ok(())
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

    #[test]
    fn tar_gz_roundtrip_preserves_nested_files() {
        let d = tempdir().unwrap();
        let src = d.path().join("src");
        fs::create_dir_all(src.join("sub")).unwrap();
        fs::write(src.join("a.txt"), "hello tar").unwrap();
        fs::write(src.join("sub").join("b.txt"), "nested").unwrap();

        let out = d.path().join("out.tar.gz");
        compress_items_tracked(
            &[src.to_string_lossy().to_string()],
            out.to_str().unwrap(),
            || false,
            |_, _, _| {},
        )
        .unwrap();
        assert!(out.is_file());

        let dest = d.path().join("dest");
        let n = extract_items_tracked(
            out.to_str().unwrap(),
            dest.to_str().unwrap(),
            || false,
            |_, _, _| {},
        )
        .unwrap();
        assert!(n >= 2, "expected at least 2 entries, got {n}");
        assert_eq!(
            fs::read_to_string(dest.join("src").join("a.txt")).unwrap(),
            "hello tar"
        );
        assert_eq!(
            fs::read_to_string(dest.join("src").join("sub").join("b.txt")).unwrap(),
            "nested"
        );
    }

    #[test]
    fn tar_extract_skips_path_traversal_entries() {
        // `tar::Builder` refuses to *write* a path containing `..`, so the
        // archive is assembled by hand here to exercise the reading side.
        let mut block = [0u8; 512];
        block[..14].copy_from_slice(b"../escaped.txt");
        block[100..108].copy_from_slice(b"0000644\0"); // mode
        block[108..116].copy_from_slice(b"0000000\0"); // uid
        block[116..124].copy_from_slice(b"0000000\0"); // gid
        block[124..136].copy_from_slice(b"00000000003\0"); // size = 3
        block[136..148].copy_from_slice(b"00000000000\0"); // mtime
        block[148..156].copy_from_slice(b"        "); // checksum placeholder
        block[156] = b'0'; // typeflag: regular file
        block[257..263].copy_from_slice(b"ustar\0"); // magic
        block[263..265].copy_from_slice(b"00"); // version
        let sum: u32 = block.iter().map(|&b| b as u32).sum();
        block[148..156].copy_from_slice(format!("{sum:06o}\0 ").as_bytes());

        let mut bytes = block.to_vec();
        let mut data = [0u8; 512];
        data[..3].copy_from_slice(b"bad");
        bytes.extend_from_slice(&data); // payload block
        bytes.extend_from_slice(&[0u8; 1024]); // two zero blocks = EOF

        let d = tempdir().unwrap();
        let p = d.path().join("evil.tar");
        fs::write(&p, bytes).unwrap();

        let dest = d.path().join("dest");
        let n = extract_items_tracked(
            p.to_str().unwrap(),
            dest.to_str().unwrap(),
            || false,
            |_, _, _| {},
        )
        .unwrap();
        assert_eq!(n, 0, "a `..` entry must never be unpacked");
        assert!(!d.path().join("escaped.txt").exists());
    }
}

