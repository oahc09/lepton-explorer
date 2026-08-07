use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

/// Remote manifest describing the latest available release. Served from the
/// repo (raw GitHub) so no extra update server is required. Bump `version`
/// here and upload the new installer to publish an update.
const UPDATE_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/oahc09/lepton-explorer/main/latest.json";

/// What the frontend receives when an update is available.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
    pub download_url: String,
    pub pub_date: Option<String>,
}

/// Shape of `latest.json` on the server.
#[derive(Debug, Deserialize)]
struct Manifest {
    version: String,
    notes: String,
    download_url: String,
    pub_date: Option<String>,
}

/// Progress payload streamed to the UI during download.
#[derive(Clone, Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
    percent: u8,
}

/// Cache directory for downloaded installers.
fn updates_dir() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("lepton-explorer")
        .join("updates")
}

/// Fetch `latest.json`, compare its version against the running binary, and
/// return `Some(UpdateInfo)` when a newer release exists.
#[tauri::command]
pub async fn check_update() -> Result<Option<UpdateInfo>, String> {
    let resp = reqwest::Client::new()
        .get(UPDATE_MANIFEST_URL)
        .header(reqwest::header::USER_AGENT, "lepton-explorer-updater")
        .send()
        .await
        .map_err(|e| format!("无法连接更新服务器：{e}"))?;

    if !resp.status().is_success() {
        return Err(format!("更新服务器返回状态 {}", resp.status()));
    }

    let manifest: Manifest = resp
        .json()
        .await
        .map_err(|e| format!("更新信息解析失败：{e}"))?;

    let current = env!("CARGO_PKG_VERSION");
    let newer = match (semver::Version::parse(current), semver::Version::parse(&manifest.version)) {
        (Ok(c), Ok(l)) => l > c,
        // Fall back to exact-string comparison if either side isn't valid semver.
        _ => manifest.version != current,
    };

    if newer {
        Ok(Some(UpdateInfo {
            version: manifest.version,
            notes: manifest.notes,
            download_url: manifest.download_url,
            pub_date: manifest.pub_date,
        }))
    } else {
        Ok(None)
    }
}

/// Download the installer to the app cache directory, emitting
/// `update-download-progress` events so the UI can render a progress bar.
/// Returns the local path of the downloaded installer.
#[tauri::command]
pub async fn download_update(app: AppHandle, url: String) -> Result<String, String> {
    let dir = updates_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建下载目录：{e}"))?;

    let mut resp = reqwest::Client::new()
        .get(&url)
        .header(reqwest::header::USER_AGENT, "lepton-explorer-updater")
        .send()
        .await
        .map_err(|e| format!("下载失败：{e}"))?;

    if !resp.status().is_success() {
        return Err(format!("下载链接返回状态 {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);

    // Fixed, filesystem-safe name for the downloaded installer. The NSIS
    // payload is identical regardless of name, and a stable name keeps the
    // cache directory tidy across updates (and avoids issues with spaces /
    // URL-encoding in the remote filename).
    let dest = dir.join("lepton-explorer-setup.exe");

    let mut file = File::create(&dest).map_err(|e| format!("无法写入安装包：{e}"))?;

    let mut downloaded: u64 = 0;
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("下载中断：{e}"))?
    {
        file.write_all(&chunk).map_err(|e| format!("写入失败：{e}"))?;
        downloaded += chunk.len() as u64;
        let percent = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0).min(100.0) as u8
        } else {
            0
        };
        let _ = app.emit(
            "update-download-progress",
            DownloadProgress {
                downloaded,
                total,
                percent,
            },
        );
    }
    file.flush().ok();

    Ok(dest.to_string_lossy().to_string())
}

/// Launch the downloaded installer and exit the current app so the installer
/// can replace its files (in-place upgrade). The NSIS installer handles the
/// rest of the upgrade flow.
#[tauri::command]
pub fn install_update(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("安装包不存在，请重新下载".into());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new(p)
            .spawn()
            .map_err(|e| format!("无法启动安装程序：{e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new(p).spawn();
    }

    // Give the installer a moment to start, then let go of the running binary
    // so its files can be replaced.
    std::thread::sleep(std::time::Duration::from_millis(800));
    std::process::exit(0);
}
