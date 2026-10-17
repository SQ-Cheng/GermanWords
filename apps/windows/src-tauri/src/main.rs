#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::State;
use tauri_plugin_updater::{Update, UpdaterExt};

const CONFIG: &str = include_str!("../../../../shared/app-config.json");

#[derive(Default)]
struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Serialize)]
struct UpdateInfo {
    version: String,
    notes: String,
}

#[tauri::command]
async fn check_update(
    app: tauri::AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
    let config: serde_json::Value = serde_json::from_str(CONFIG).map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let share = config["shareUrl"].as_str().ok_or("更新来源无效")?;
    let path = config["windowsUpdater"]["manifestPath"]
        .as_str()
        .ok_or("更新路径无效")?;
    let endpoint = format!("{share}files/?p={path}&raw=1&t={now}")
        .parse()
        .map_err(|_| "更新地址无效")?;
    let update = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| e.to_string())?
        .timeout(Duration::from_secs(30))
        .header(
            "User-Agent",
            format!("GermanWords/{}", app.package_info().version),
        )
        .map_err(|e| e.to_string())?
        .header("Cache-Control", "no-cache")
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(ref release) = update {
        let origin: tauri::Url = share.parse().map_err(|_| "更新来源无效")?;
        if release.download_url.scheme() != "https"
            || release.download_url.host_str() != origin.host_str()
        {
            return Err("安装包不在指定云盘中".into());
        }
    }
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        notes: u.body.clone().unwrap_or_default(),
    });
    *pending.0.lock().map_err(|_| "更新状态不可用")? = update;
    Ok(info)
}

#[tauri::command]
async fn install_update(pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .map_err(|_| "更新状态不可用")?
        .take()
        .ok_or("请重新检查更新")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PendingUpdate::default())
        .invoke_handler(tauri::generate_handler![check_update, install_update])
        .setup(|app| {
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(|url| {
                    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                        || (url.scheme() == "http"
                            && url.host_str() == Some("tauri.localhost")
                            && url.port().is_none())
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Unable to start GermanWords");
}
