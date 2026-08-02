# Lepton Explorer — Performance Benchmarks

Last updated: 2026-07-13 (after the security + memory hardening pass; see
`docs/acceptance/phase1-checklist.md` for functional acceptance).

## How to run

```bash
# Backend (Rust) — release profile, ignored perf tests.
cd src-tauri
cargo test --release -- --ignored perf_ --nocapture

# Frontend (React) — render benchmarks.
npx vitest run src/performance/largeList.test.tsx
```

## Backend benchmarks (release, measured 2026-07-13)

Machine: Windows 11 / Ryzen AI 9 HX 370 / SSD. Each bench runs once on a
fresh `tempdir`; numbers are indicative, not statistically averaged.

| Benchmark | Workload | Result |
|---|---|---|
| `perf_copy_1000_small_files` | copy 1000 × 1 KiB files | **1.710 s** (≈ 584.7 files/s) |
| `perf_move_1000_small_files` | move 1000 × 1 KiB files (same volume) | **1.105 s** (≈ 904.7 files/s) |
| `perf_list_large_directory` | `list_directory` over 5000 entries | **20.48 ms** (≈ 250 entries/ms) |
| `perf_thumbnail_100_images` | `get_thumbnail` × 100 (1024×768 PNG) | **3.723 s** (≈ 26.9 thumbnails/s) |
| `perf_thumbnail_cache_hit` | 200 cache hits (primed) | **532 µs** (avg 2.66 µs/hit, ≈ 375.9 hits/ms) |

Notes:
- Copy is slower than move because move is a same-volume `rename` while copy
  decodes/encodes every file.
- Thumbnail generation is decode-bound; the LRU cache (capacity 128) makes
  repeated lookups ~700× faster than first decode (2.66 µs vs ~37 ms/hit).

## Frontend render benchmarks (memoization pass, Round 2 — 2026-07-11)

Initial render of **2000 entries** before vs after the `React.memo` +
`useMemo` pass. Re-run `npx vitest run src/performance/largeList.test.tsx`
for live figures.

| View | Before (unmemoized) | After (memoized) | Speedup |
|---|---|---|---|
| DetailsView | 7.5 ms | 3.7 ms | 2.0× |
| TilesView | 5.1 ms | 2.4 ms | 2.1× |
| ListView | 5.5 ms | 3.3 ms | 1.7× |
| IconsView | 4.7 ms | 3.3 ms | 1.4× |
| ContentView | (unmemoized) | memoized | — |

Root cause fixed: row components subscribed to the *entire* Zustand store via
`useSelectionStore()` without a selector, so every state change re-rendered
all rows. Switched to `useSelectionStore.getState()` in event handlers and
narrow selectors, and passed `isSelected` as a prop.

## Memory notes (Round 3 — 2026-07-11)

- Thumbnails: frontend switched from base64 data URLs to `URL.createObjectURL`
  (Object URLs), cutting JS heap by ~6 MB; URLs are revoked on LRU eviction.
- Recursive `search()` capped at 5000 results to bound memory growth.
- Backend thumbnail LRU cache reduced 200 → 128.
