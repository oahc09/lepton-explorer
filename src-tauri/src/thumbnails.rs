use base64::Engine;
use image::GenericImageView;
use once_cell::sync::Lazy;
use std::io::Cursor;
use std::num::NonZeroUsize;
use std::sync::Mutex;

/// Global LRU cache for thumbnail/base64 results.
/// Key = (path, size).  Capacity = 128 entries — each entry is a base64 string
/// (avg ~2KB for a 32×32 icon, ~15KB for a 200×200 thumbnail), so 128 entries
/// caps memory at ~2MB worst case. The frontend also caches 200 Object URLs,
/// so the backend cache only needs to cover the working set of one scroll view.
static THUMB_CACHE: Lazy<Mutex<lru::LruCache<(String, u32), String>>> =
    Lazy::new(|| Mutex::new(lru::LruCache::new(NonZeroUsize::new(128).unwrap())));

/// Look up the cache; on hit, return a clone of the cached base64 string.
/// On miss, compute `compute()`, store in cache, and return.
fn with_cache<F>(key: (String, u32), compute: F) -> Option<String>
where
    F: FnOnce() -> Option<String>,
{
    // Fast path: try to get from cache with a short-lived lock. A poisoned
    // mutex (a thread panicked while holding it) is recovered via into_inner
    // instead of crashing the command.
    if let Some(hit) = THUMB_CACHE.lock().unwrap_or_else(|e| e.into_inner()).get(&key) {
        return Some(hit.clone());
    }
    // Miss → compute.
    let result = compute()?;
    // Store in cache (put() evicts LRU if over capacity).
    THUMB_CACHE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .put(key, result.clone());
    Some(result)
}

#[cfg(windows)]
pub fn get_icon(path: &str, size: u32) -> Option<String> {
    let key = (path.to_string(), size);
    with_cache(key, || {
        use windows::core::PCWSTR;
        use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
        use windows::Win32::UI::Shell::{
            SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON, SHGFI_SMALLICON,
        };
        use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;

        let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        let mut info = SHFILEINFOW::default();
        let flags = SHGFI_ICON | if size >= 32 { SHGFI_LARGEICON } else { SHGFI_SMALLICON };
        // SHGetFileInfoW returns a DWORD ptr value; 0 means failure.
        let r = unsafe {
            SHGetFileInfoW(
                PCWSTR(wide.as_ptr()),
                FILE_FLAGS_AND_ATTRIBUTES(0),
                Some(&mut info),
                std::mem::size_of::<SHFILEINFOW>() as u32,
                flags,
            )
        };
        if r == 0 || info.hIcon.is_invalid() {
            return None;
        }
        let png = icon_to_png(info.hIcon);
        unsafe {
            let _ = DestroyIcon(info.hIcon);
        }
        png
    })
}

#[cfg(windows)]
fn icon_to_png(hicon: windows::Win32::UI::WindowsAndMessaging::HICON) -> Option<String> {
    use windows::Win32::Graphics::Gdi::{
        BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CreateCompatibleDC, DeleteDC, DeleteObject,
        DIB_RGB_COLORS, GetDIBits, GetObjectW, SelectObject,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO};

    unsafe {
        let mut ii = ICONINFO::default();
        if GetIconInfo(hicon, &mut ii).is_err() {
            return None;
        }
        let hbm = ii.hbmColor;
        if hbm.is_invalid() {
            let _ = DeleteObject(ii.hbmMask);
            return None;
        }

        // Query the actual bitmap dimensions instead of hardcoding 32×32.
        // On high-DPI displays or with per-monitor DPI awareness, the icon
        // bitmap can be 48×48, 64×64, etc.  Hardcoding 32 would crop.
        let mut bm = BITMAP::default();
        if GetObjectW(
            hbm,
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut _ as *mut _),
        ) == 0
        {
            // Fallback: assume 32×32.
            bm.bmWidth = 32;
            bm.bmHeight = 32;
        }
        let w = bm.bmWidth.max(1);
        let h = bm.bmHeight.max(1);

        let dc = CreateCompatibleDC(None);
        let old = SelectObject(dc, hbm);
        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = vec![0u8; (w as usize) * (h as usize) * 4];
        let got = GetDIBits(
            dc,
            hbm,
            0,
            h as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bi,
            DIB_RGB_COLORS,
        );
        SelectObject(dc, old);
        let _ = DeleteDC(dc);
        let _ = DeleteObject(ii.hbmColor);
        let _ = DeleteObject(ii.hbmMask);
        if got == 0 {
            return None;
        }
        // BGRA -> RGBA
        for px in pixels.chunks_exact_mut(4) {
            px.swap(0, 2);
        }
        let img = image::RgbaImage::from_raw(w as u32, h as u32, pixels)?;
        let mut buf = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(img)
            .write_to(&mut std::io::BufWriter::new(&mut buf), image::ImageFormat::Png)
            .ok()?;
        Some(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
    }
}

#[cfg(not(windows))]
pub fn get_icon(_path: &str, _size: u32) -> Option<String> {
    None
}

/// Hard pixel-count cap for thumbnail sources. Decoding a 50 MP photo costs
/// ~200 MB of RGBA before any resize — far too much for a 200 px thumbnail.
/// 16 MP (typical binned phone photo) decodes to ~64 MB transient, which is
/// acceptable; anything larger falls back to the generic icon (frontend emoji).
/// (The `image` 0.25 jpeg backend no longer exposes DCT downscale decoding,
/// so a pixel cap is the effective memory guard.)
const MAX_THUMB_PIXELS: u64 = 16_000_000;

pub fn get_thumbnail(path: &str, size: u32) -> Option<String> {
    let key = (path.to_string(), size);
    with_cache(key, || {
        let p = std::path::Path::new(path);
        // Pre-check dimensions WITHOUT decoding; refuse oversized sources.
        let (ow, oh) = image::image_dimensions(p).ok()?;
        if (ow as u64).saturating_mul(oh as u64) > MAX_THUMB_PIXELS {
            return None;
        }
        let img = image::open(p).ok()?;
        // Preserve aspect ratio: scale to fit within size×size without cropping.
        let (dw, dh) = img.dimensions();
        let scale = (size as f64 / dw.max(1) as f64).min(size as f64 / dh.max(1) as f64);
        let nw = (dw as f64 * scale).round().max(1.0) as u32;
        let nh = (dh as f64 * scale).round().max(1.0) as u32;
        // For small thumbnails (≤64px), Triangle is 5-10× faster than Lanczos3
        // with visually identical results at those sizes. For larger thumbnails,
        // Lanczos3 preserves detail better.
        let filter = if size <= 64 {
            image::imageops::FilterType::Triangle
        } else {
            image::imageops::FilterType::Lanczos3
        };
        let thumb = image::imageops::resize(&img, nw, nh, filter);
        let mut buf = Cursor::new(Vec::new());
        thumb
            .write_to(&mut std::io::BufWriter::new(&mut buf), image::ImageFormat::Png)
            .ok()?;
        Some(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};
    use tempfile::tempdir;

    fn make_png(p: &std::path::Path) {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_fn(64, 64, |_x, _y| Rgba([10, 20, 30, 255]));
        img.save(p).unwrap();
    }

    #[test]
    fn thumbnail_for_image_returns_base64_png() {
        let d = tempdir().unwrap();
        let imgp = d.path().join("a.png");
        make_png(&imgp);
        let out = get_thumbnail(imgp.to_str().unwrap(), 48).unwrap();
        assert!(
            out.starts_with("iVBOR"),
            "expected base64 PNG (starts with iVBOR), got start: {}",
            &out[..out.len().min(20)]
        );
    }

    #[test]
    fn thumbnail_for_non_image_returns_none() {
        let d = tempdir().unwrap();
        let p = d.path().join("a.txt");
        std::fs::write(&p, "hi").unwrap();
        assert!(get_thumbnail(p.to_str().unwrap(), 48).is_none());
    }

    #[test]
    fn thumbnail_cache_hit_avoids_re_decode() {
        let d = tempdir().unwrap();
        let imgp = d.path().join("b.png");
        make_png(&imgp);
        let path = imgp.to_str().unwrap();
        // First call: decode + cache.
        let a = get_thumbnail(path, 48).unwrap();
        // Second call: cache hit (same base64).
        let b = get_thumbnail(path, 48).unwrap();
        assert_eq!(a, b, "cache hit must return identical base64");
    }
}
