use crate::{restricted_client, CONFIG};
use reqwest::multipart::{Form, Part};
use serde_json::{json, Value};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

fn report(config: &Value, message: &str, user_agent: &str) -> Result<Value, String> {
    let message = message.trim();
    if message.is_empty() || message.encode_utf16().count() > 4000 || user_agent.len() > 512 {
        return Err("反馈内容无效".into());
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "系统时间无效")?;
    Ok(json!({
        "schema": 1, "submittedAtUnixMs": now.as_millis() as u64, "message": message,
        "app": {"versionName": config["versionName"], "versionCode": config["versionCode"],
                "channel": config["channel"], "platform": "windows"},
        "device": {"os": std::env::consts::OS, "architecture": std::env::consts::ARCH,
                   "webviewUserAgent": user_agent}
    }))
}

#[tauri::command]
pub async fn submit_feedback(message: String, user_agent: String) -> Result<(), String> {
    // Keep service URLs and transport errors out of the user-facing response.
    send(&message, &user_agent)
        .await
        .map_err(|_| "提交失败，请稍后重试".into())
}

async fn send(message: &str, user_agent: &str) -> Result<(), Box<dyn std::error::Error>> {
    let config: Value = serde_json::from_str(CONFIG)?;
    let data = report(&config, message, user_agent)?;
    let share: tauri::Url = config["feedbackUploadUrl"]
        .as_str()
        .ok_or("反馈入口无效")?
        .parse()?;
    let origin: tauri::Url = config["shareUrl"].as_str().ok_or("服务入口无效")?.parse()?;
    let host = origin.host_str().ok_or("服务入口无效")?;
    if !crate::trusted_update_url(&share, host, 0) {
        return Err("反馈入口无效".into());
    }
    let token = share
        .path()
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .ok_or("反馈入口无效")?;
    let client = restricted_client(reqwest::Client::builder(), host.to_owned())
        .user_agent("GermanWords")
        .timeout(Duration::from_secs(45))
        .build()?;
    let endpoint = format!("https://{host}/api/v2.1/upload-links/{token}/upload/");
    let response: Value = read_json(client.get(endpoint).send().await?).await?;
    let mut upload: tauri::Url = response["upload_link"]
        .as_str()
        .ok_or("上传入口无效")?
        .parse()?;
    if !crate::trusted_update_url(&upload, host, 0) {
        return Err("上传入口无效".into());
    }
    upload.query_pairs_mut().append_pair("ret-json", "1");
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let name = format!("feedback-windows-{now}.json");
    let part = Part::text(serde_json::to_string_pretty(&data)?)
        .file_name(name.clone())
        .mime_str("application/json")?;
    // A POST must not be replayed or converted into GET after a redirect.
    let upload_client = reqwest::Client::builder()
        .user_agent("GermanWords")
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(45))
        .build()?;
    let response = upload_client
        .post(upload)
        .multipart(
            Form::new()
                .text(
                    "parent_dir",
                    config["feedbackUploadPath"]
                        .as_str()
                        .ok_or("反馈目录无效")?
                        .to_owned(),
                )
                .part("file", part),
        )
        .send()
        .await?
        .error_for_status()?;
    if !response.status().is_success() {
        return Err("提交未确认".into());
    }
    let result = read_json(response).await?;
    if result.as_array().map(Vec::len) != Some(1) || result[0]["name"].as_str() != Some(&name) {
        return Err("提交未确认".into());
    }
    Ok(())
}

async fn read_json(response: reqwest::Response) -> Result<Value, Box<dyn std::error::Error>> {
    let mut response = response.error_for_status()?;
    let mut data = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if data.len() + chunk.len() > 65536 {
            return Err("服务响应过大".into());
        }
        data.extend_from_slice(&chunk);
    }
    Ok(serde_json::from_slice(&data)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reports_have_only_explicit_metadata_and_bounded_content() {
        let config = serde_json::from_str(CONFIG).unwrap();
        let value = report(&config, "  test  ", "WebView test").unwrap();
        assert_eq!(value["message"], "test");
        assert_eq!(value["app"]["platform"], "windows");
        assert!(value["submittedAtUnixMs"].as_u64().unwrap() > 0);
        assert_eq!(value.as_object().unwrap().len(), 5);
        assert!(report(&config, " ", "test").is_err());
        assert!(report(&config, &"😀".repeat(2001), "test").is_err());
        assert!(report(&config, "test", &"x".repeat(513)).is_err());
    }
}
