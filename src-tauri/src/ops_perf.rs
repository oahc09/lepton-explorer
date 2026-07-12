//! Performance benchmarks for file operations.
//! Run with: `cargo test --release -- --ignored perf_`

use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::Instant;
use tempfile::tempdir;

/// Helper: create N small files (1 KiB each) in `dir`.
fn create_files(dir: &Path, n: usize) {
    for i in 0..n {
        let p = dir.join(format!("file_{i:06}.txt"));
        let mut f = fs::File::create(p).unwrap();
        f.write_all(&vec![b'x'; 1024]).unwrap();
    }
}

#[test]
#[ignore = "performance benchmark: copies 1000 small files and prints elapsed time"]
fn perf_copy_1000_small_files() {
    let d = tempdir().unwrap();
    let src = d.path().join("src");
    fs::create_dir(&src).unwrap();
    create_files(&src, 1000);

    let dest = d.path().join("dest");
    fs::create_dir(&dest).unwrap();

    let sources: Vec<String> = src.read_dir().unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    eprintln!("  [perf] copy: {} source files, dest={:?}", sources.len(), dest);

    let start = Instant::now();
    let result = crate::ops::copy_items_tracked(
        &sources,
        dest.to_str().unwrap(),
        crate::ops::ConflictStrategy::Rename,
        || false,
        |_, _, _| {},
    );
    let elapsed = start.elapsed();

    assert!(result.is_ok(), "copy should succeed: {:?}", result.err());
    let copied = result.unwrap().paths.len();
    println!("\n[perf] copy 1000 files (1 KiB each): {elapsed:?} ({copied} files copied, {:.1} files/s)",
        copied as f64 / elapsed.as_secs_f64());
}

#[test]
#[ignore = "performance benchmark: moves 1000 small files and prints elapsed time"]
fn perf_move_1000_small_files() {
    let d = tempdir().unwrap();
    let src = d.path().join("src");
    fs::create_dir(&src).unwrap();
    create_files(&src, 1000);

    let dest = d.path().join("dest");
    fs::create_dir(&dest).unwrap();

    let sources: Vec<String> = src.read_dir().unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    eprintln!("  [perf] move: {} source files, dest={:?}", sources.len(), dest);

    let start = Instant::now();
    let result = crate::ops::move_items_tracked(
        &sources,
        dest.to_str().unwrap(),
        crate::ops::ConflictStrategy::Rename,
        || false,
        |_, _, _| {},
    );
    let elapsed = start.elapsed();

    assert!(result.is_ok(), "move should succeed: {:?}", result.err());
    let moved = result.unwrap().pairs.len();
    println!("\n[perf] move 1000 files (1 KiB each): {elapsed:?} ({moved} files moved, {:.1} files/s)",
        moved as f64 / elapsed.as_secs_f64());
}

#[test]
#[ignore = "performance benchmark: lists a directory with many entries"]
fn perf_list_large_directory() {
    let d = tempdir().unwrap();
    create_files(d.path(), 5000);

    let start = Instant::now();
    let entries = crate::fs_ops::list_directory(d.path().to_str().unwrap());
    let elapsed = start.elapsed();

    let entries = entries.unwrap();
    println!("\n[perf] list_directory with {} entries: {:?} ({:.1} entries/ms)",
        entries.len(),
        elapsed,
        entries.len() as f64 / elapsed.as_millis() as f64);
    assert!(entries.len() >= 5000);
}
