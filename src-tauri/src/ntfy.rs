use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Mutex;
use futures_util::StreamExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NtfyMessage {
    pub id: String,
    pub time: i64,
    pub event: String,
    pub topic: String,
    pub message: Option<String>,
    pub title: Option<String>,
    pub tags: Option<Vec<String>>,
    pub priority: Option<i32>,
}

// 애플리케이션 상태: 현재 구독 중인 토픽들의 백그라운드 태스크 핸들을 보관
// Key는 "{server_url}/{topic}" 형태의 전체 URL을 사용합니다.
pub struct NtfyState {
    pub subscriptions: Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>,
}

impl Default for NtfyState {
    fn default() -> Self {
        Self {
            subscriptions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[tauri::command]
pub async fn subscribe(server_url: String, topic: String, app: AppHandle) -> Result<(), String> {
    let state = app.state::<NtfyState>();
    let mut subs = state.subscriptions.lock().await;

    let base_url = server_url.trim_end_matches('/');
    let full_url = format!("{}/{}", base_url, topic);

    // 이미 구독 중인 경우 무시
    if subs.contains_key(&full_url) {
        return Ok(());
    }

    let full_url_clone = full_url.clone();
    let app_clone = app.clone();

    // 백그라운드 비동기 태스크 생성 (SSE 구독)
    let handle = tokio::spawn(async move {
        let sse_url = format!("{}/sse", full_url_clone);
        let client = reqwest::Client::new();

        loop {
            // 서버 접속 및 SSE 스트림 처리
            if let Ok(resp) = client.get(&sse_url).send().await {
                let mut stream = resp.bytes_stream();
                let mut buffer = String::new();

                while let Some(item) = stream.next().await {
                    if let Ok(bytes) = item {
                        if let Ok(text) = std::str::from_utf8(&bytes) {
                            buffer.push_str(text);
                            
                            // SSE 메시지는 두 개의 줄바꿈(\n\n)으로 구분됨
                            while let Some(idx) = buffer.find("\n\n") {
                                let event_str = buffer[..idx].to_string();
                                buffer = buffer[idx + 2..].to_string();

                                for line in event_str.lines() {
                                    if let Some(data) = line.strip_prefix("data: ") {
                                        // JSON 파싱
                                        if let Ok(msg) = serde_json::from_str::<NtfyMessage>(data) {
                                            if msg.event == "message" {
                                                // 1. 네이티브 윈도우 알림 띄우기
                                                let title = msg.title.clone().unwrap_or_else(|| format!("ntfy: {}", msg.topic));
                                                let body = msg.message.clone().unwrap_or_default();

                                                let _ = app_clone.notification()
                                                    .builder()
                                                    .title(&title)
                                                    .body(&body)
                                                    .show();

                                                // 2. 프론트엔드로 이벤트 발송하여 UI 업데이트
                                                // 프론트엔드에서 서버별로 구분할 수 있도록 메시지 객체를 그대로 전달
                                                let _ = app_clone.emit("new-message", &msg);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        // 스트림 오류 시 루프를 빠져나가 재연결 시도
                        break; 
                    }
                }
            }
            // 연결 끊어짐/오류 시 5초 후 재연결 시도
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
    });

    subs.insert(full_url, handle);
    Ok(())
}

#[tauri::command]
pub async fn unsubscribe(server_url: String, topic: String, app: AppHandle) -> Result<(), String> {
    let state = app.state::<NtfyState>();
    let mut subs = state.subscriptions.lock().await;

    let base_url = server_url.trim_end_matches('/');
    let full_url = format!("{}/{}", base_url, topic);

    // 구독 취소 시 백그라운드 태스크 중단(Abort)
    if let Some(handle) = subs.remove(&full_url) {
        handle.abort();
    }

    Ok(())
}
