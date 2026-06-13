use base64::Engine;
use std::io::Cursor;

#[cfg(windows)]
pub fn get_icon(path: &str, size: u32) -> Option<String> {
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
}

#[cfg(windows)]
fn icon_to_png(hicon: windows::Win32::UI::WindowsAndMessaging::HICON) -> Option<String> {
    use windows::Win32::Graphics::Gdi::{
        BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CreateCompatibleDC, DeleteDC, DeleteObject,
        DIB_RGB_COLORS, GetDIBits, SelectObject,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO};

    const W: i32 = 32;
    const H: i32 = 32;
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
        let dc = CreateCompatibleDC(None);
        let old = SelectObject(dc, hbm);
        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: W,
                biHeight: -H, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = vec![0u8; (W as usize) * (H as usize) * 4];
        let got = GetDIBits(
            dc,
            hbm,
            0,
            H as u32,
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
        let img = image::RgbaImage::from_raw(W as u32, H as u32, pixels)?;
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

pub fn get_thumbnail(path: &str, size: u32) -> Option<String> {
    let img = image::open(std::path::Path::new(path)).ok()?;
    let thumb = image::imageops::resize(&img, size, size, image::imageops::FilterType::Nearest);
    let mut buf = Cursor::new(Vec::new());
    thumb
        .write_to(&mut std::io::BufWriter::new(&mut buf), image::ImageFormat::Png)
        .ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
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
}
