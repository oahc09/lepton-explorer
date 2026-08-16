//! Personalization: window effects (Mica/Acrylic), daily wallpaper, daily
//! quote, and a local image background. The network fetches (daily image/quote)
//! live here in Rust so they are not blocked by the webview CSP.

use std::io::Read;

use base64::Engine;
use tauri::window::{Effect, EffectState, EffectsBuilder};

use crate::error::{AppError, Result};

/// Apply a window material: "mica" | "acrylic" | anything else → none.
/// Mica/Acrylic are Windows 11/10 features; on unsupported systems the call
/// silently no-ops and the frontend falls back to opaque theme colors.
#[tauri::command]
pub fn apply_window_effect(window: tauri::Window, effect: String) -> Result<()> {
    let builder = match effect.as_str() {
        "acrylic" => EffectsBuilder::new().effect(Effect::Acrylic).state(EffectState::Active),
        "mica" => EffectsBuilder::new().effect(Effect::Mica).state(EffectState::Active),
        // Empty effects list clears the material (falls back to opaque colors).
        _ => EffectsBuilder::new(),
    };
    window
        .set_effects(builder.build())
        .map_err(|e| AppError::Unknown(e.to_string()))
}

/// Fetch Bing's daily wallpaper and return it as a `data:image/jpeg;base64,...`
/// URL. Fails (Err) when offline, so the frontend can degrade silently.
#[tauri::command]
pub async fn daily_image() -> Result<String> {
    let client = reqwest::Client::new();
    let meta: serde_json::Value = client
        .get("https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN")
        .send()
        .await
        .map_err(|e| AppError::Unknown(e.to_string()))?
        .json()
        .await
        .map_err(|e| AppError::Unknown(e.to_string()))?;

    let urlbase = meta["images"][0]["urlbase"]
        .as_str()
        .ok_or_else(|| AppError::Unknown("Bing 壁纸接口无数据".into()))?;
    let img_url = format!("https://www.bing.com{urlbase}_1920x1080.jpg");

    let bytes = client
        .get(&img_url)
        .send()
        .await
        .map_err(|e| AppError::Unknown(e.to_string()))?
        .bytes()
        .await
        .map_err(|e| AppError::Unknown(e.to_string()))?;

    Ok(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    ))
}

/// Fetch a daily quote from hitokoto ("一言") and return it as plain text
/// ("句子 —— 出处"). Fails when offline.
#[tauri::command]
pub async fn daily_quote() -> Result<String> {
    let resp: serde_json::Value = reqwest::Client::new()
        .get("https://v1.hitokoto.cn/")
        .send()
        .await
        .map_err(|e| AppError::Unknown(e.to_string()))?
        .json()
        .await
        .map_err(|e| AppError::Unknown(e.to_string()))?;

    let quote = resp["hitokoto"].as_str().unwrap_or_default();
    let from = resp["from"].as_str().unwrap_or_default();
    Ok(if from.is_empty() {
        quote.to_string()
    } else {
        format!("{quote} —— {from}")
    })
}

/// Read a local image file and return it as a `data:<mime>;base64,...` URL so it
/// can be used as the app background without touching the CSP.
#[tauri::command]
pub fn read_image_background(path: String) -> Result<String> {
    let mut f = std::fs::File::open(&path)?;
    let mut bytes = Vec::new();
    f.read_to_end(&mut bytes)?;

    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => "image/png",
    };
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    ))
}
