#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod feedback;

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

fn trusted_update_url(url: &tauri::Url, host: &str, previous: usize) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some(host)
        && previous < 6
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
}

fn restricted_client(client: reqwest::ClientBuilder, host: String) -> reqwest::ClientBuilder {
    client
        .https_only(true)
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if trusted_update_url(attempt.url(), &host, attempt.previous().len()) {
                attempt.follow()
            } else {
                attempt.error("服务重定向地址无效或次数过多")
            }
        }))
}

fn release_allowed(channel: &str, release: &tauri_plugin_updater::RemoteRelease) -> bool {
    channel == "beta" || (channel == "stable" && release.version.pre.is_empty())
}

#[tauri::command]
async fn check_update(
    app: tauri::AppHandle,
    pending: State<'_, PendingUpdate>,
    channel: String,
) -> Result<Option<UpdateInfo>, String> {
    if channel != "stable" && channel != "beta" {
        return Err("更新通道无效".into());
    }
    *pending.0.lock().map_err(|_| "更新状态不可用")? = None;
    let config: serde_json::Value = serde_json::from_str(CONFIG).map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let share = config["shareUrl"].as_str().ok_or("更新来源无效")?;
    let origin: tauri::Url = share.parse().map_err(|_| "更新来源无效")?;
    let host = origin.host_str().ok_or("更新域名无效")?.to_owned();
    if !trusted_update_url(&origin, &host, 0) {
        return Err("更新来源必须使用 HTTPS".into());
    }
    let redirect_host = host.clone();
    let path = config["manifestPaths"][&channel]
        .as_str()
        .ok_or("更新路径无效")?;
    let endpoint = format!("{share}files/?p={path}&raw=1&t={now}")
        .parse()
        .map_err(|_| "更新地址无效")?;
    let update = app
        .updater_builder()
        .version_comparator({
            let channel = channel.clone();
            move |current, release| release.version > current && release_allowed(&channel, &release)
        })
        .endpoints(vec![endpoint])
        .map_err(|e| e.to_string())?
        .timeout(Duration::from_secs(30))
        .configure_client(move |client| restricted_client(client, redirect_host.clone()))
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
        if release
            .raw_json
            .get("channel")
            .and_then(|value| value.as_str())
            .is_some_and(|value| value != channel)
        {
            return Err("更新通道不匹配".into());
        }
        if !trusted_update_url(&release.download_url, &host, 0) {
            return Err("安装包来源无效".into());
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
        .invoke_handler(tauri::generate_handler![
            check_update,
            install_update,
            feedback::submit_feedback
        ])
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

#[cfg(test)]
mod tests {
    use super::trusted_update_url;

    #[test]
    fn stable_rejects_prereleases_and_beta_accepts_both() {
        for version in ["4.2.1-beta.5", "4.2.1", "4.3.0-beta.1"] {
            let release = serde_json::from_value(serde_json::json!({
                "version":version,"platforms":{}
            }))
            .unwrap();
            assert!(super::release_allowed("beta", &release));
            assert_eq!(
                super::release_allowed("stable", &release),
                version == "4.2.1"
            );
            assert!(!super::release_allowed("invalid", &release));
        }
    }

    #[test]
    fn official_updater_accepts_the_combined_index() {
        let release: tauri_plugin_updater::RemoteRelease = serde_json::from_value(serde_json::json!({
            "version": "4.2.0-beta.6", "notes": "test",
            "platforms": {"windows-x86_64": {"url": "https://cloud.example.org/4.2.0-beta.6/setup.exe", "signature": "installer signature"}},
            "payload": "android payload", "signature": "android metadata signature"
        })).unwrap();
        assert_eq!(
            release.signature("windows-x86_64").unwrap(),
            "installer signature"
        );
        assert_eq!(release.version.to_string(), "4.2.0-beta.6");
        assert!(release
            .download_url("windows-x86_64")
            .unwrap()
            .path()
            .contains("/4.2.0-beta.6/"));
    }

    #[test]
    fn update_requests_stay_on_https_origin_with_bounded_redirects() {
        let host = "cloud.example.org";
        for (url, previous, allowed) in [
            ("https://cloud.example.org/file", 0, true),
            ("https://cloud.example.org/files/redirect", 5, true),
            ("https://cloud.example.org/file", 6, false),
            ("http://cloud.example.org/file", 0, false),
            ("https://other.example.org/file", 0, false),
            ("https://cloud.example.org.attacker.test/file", 0, false),
            ("https://cloud.example.org:8443/file", 0, false),
            ("https://user@cloud.example.org/file", 0, false),
        ] {
            assert_eq!(
                trusted_update_url(&url.parse().unwrap(), host, previous),
                allowed
            );
        }
    }
}
