use base64::Engine;
use std::io::Cursor;

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
