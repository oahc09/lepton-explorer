//! Performance benchmarks for thumbnail generation.
//! Run with: `cargo test --release -- --ignored perf_`

use std::time::Instant;
use tempfile::tempdir;

/// Helper: create a test PNG file at `p` with dimensions w×h.
fn make_png(p: &std::path::Path, w: u32, h: u32) {
    let img: image::ImageBuffer<image::Rgba<u8>, Vec<u8>> =
        image::ImageBuffer::from_fn(w, h, |x, y| {
            let r = ((x * 255) / w.max(1)) as u8;
            let g = ((y * 255) / h.max(1)) as u8;
            image::Rgba([r, g, 128, 255])
        });
    img.save(p).unwrap();
}

#[test]
#[ignore = "performance benchmark: generates thumbnails for 100 images"]
fn perf_thumbnail_100_images() {
    let d = tempdir().unwrap();
    for i in 0..100usize {
        let p = d.path().join(format!("img_{i:04}.png"));
        make_png(&p, 1024, 768);
    }

    let start = Instant::now();
    for i in 0..100usize {
        let p = d.path().join(format!("img_{i:04}.png"));
        let _ = crate::thumbnails::get_thumbnail(p.to_str().unwrap(), 200);
    }
    let elapsed = start.elapsed();

    println!(
        "\n[perf] get_thumbnail for 100 images (1024×768): {:?} ({:.1} thumbnails/s)",
        elapsed,
        100f64 / elapsed.as_secs_f64(),
    );
}

#[test]
#[ignore = "performance benchmark: cache hit avoids re-decode (200 hits)"]
fn perf_thumbnail_cache_hit() {
    let d = tempdir().unwrap();
    let imgp = d.path().join("sample.png");
    make_png(&imgp, 512, 512);

    // Prime the cache (miss).
    let _ = crate::thumbnails::get_thumbnail(imgp.to_str().unwrap(), 200);

    // Now all hits.
    let start = Instant::now();
    for _ in 0..200usize {
        let _ = crate::thumbnails::get_thumbnail(imgp.to_str().unwrap(), 200);
    }
    let elapsed = start.elapsed();

    println!(
        "\n[perf] 200 cache hits: {:?} ({:.1} hits/ms, avg {:.3} µs/hit)",
        elapsed,
        200f64 / (elapsed.as_micros() as f64 / 1000.0).max(0.001),
        elapsed.as_micros() as f64 / 200.0,
    );
}
