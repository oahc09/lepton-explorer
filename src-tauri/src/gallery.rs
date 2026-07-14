//! Gallery aggregation (Win11 "Gallery" quick-access node).
//!
//! Gathers image files from the user's Pictures (and a few well-known sub-folders
//! like Screenshots / Camera Roll / Saved Pictures) plus Videos, bounded by a cap,
//! so the frontend can present a scrollable photo wall. Returns them as normal
//! `Entry` values with their real on-disk paths.

use crate::fs_ops;

const IMAGE_EXTS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "bmp", "webp", "tif", "tiff", "heic", "heif",
];

const MAX_GALLERY_ENTRIES: usize = 1000;

pub fn list_gallery() -> Vec<fs_ops::Entry> {
    let mut out: Vec<fs_ops::Entry> = Vec::new();

    // Seed roots: Pictures + Videos, plus common image sub-folders.
    let mut roots: Vec<std::path::PathBuf> = vec![
        dirs::picture_dir(),
        dirs::video_dir(),
    ]
    .into_iter()
    .flatten()
    .collect();
    for r in roots.clone() {
        for sub in ["Screenshots", "Camera Roll", "Saved Pictures"] {
            let p = r.join(sub);
            if p.is_dir() {
                roots.push(p);
            }
        }
    }

    for root in roots {
        if out.len() >= MAX_GALLERY_ENTRIES {
            break;
        }
        let path_str = root.to_string_lossy().to_string();
        let Ok(entries) = fs_ops::list_directory(&path_str) else {
            continue;
        };
        for e in entries {
            if e.is_dir {
                continue;
            }
            let ext = e.ext.to_lowercase();
            if IMAGE_EXTS.contains(&ext.as_str()) {
                out.push(e);
                if out.len() >= MAX_GALLERY_ENTRIES {
                    break;
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_gallery_does_not_panic_and_is_bounded() {
        let v = list_gallery();
        assert!(v.len() <= MAX_GALLERY_ENTRIES);
        // Every returned entry should be a non-directory image.
        assert!(v.iter().all(|e| !e.is_dir));
    }
}
