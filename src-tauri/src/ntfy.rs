use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Mutex;
use futures_util::StreamExt;
use reqwest_eventsource::{EventSource, Event};

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

    if subs.contains_key(&full_url) {
        return Ok(());
    }

    let full_url_clone = full_url.clone();
    let app_clone = app.clone();
    let base_url_clone = base_url.to_string();

    let handle = tokio::spawn(async move {
        let sse_url = format!("{}/sse", full_url_clone);
        let client = reqwest::Client::new();

        loop {
            let req = client.get(&sse_url);
            if let Ok(mut es) = EventSource::new(req) {
                while let Some(event) = es.next().await {
                    match event {
                        Ok(Event::Open) => {
                            println!("SSE Connection opened: {}", sse_url);
                        }
                        Ok(Event::Message(message)) => {
                            if let Ok(msg) = serde_json::from_str::<NtfyMessage>(&message.data) {
                                if msg.event == "message" {
                                    let title = msg.title.clone().unwrap_or_else(|| format!("ntfy: {}", msg.topic));
                                    let body = msg.message.clone().unwrap_or_default();

                                    // Tauri 표준 알림 플러그인 사용
                                    // 1. 알림 ID로 정수형 값을 전달 (시간 기반 하위 32비트 사용)
                                    // 2. 리눅스에서 팝업이 유지되도록 유도
                                    let notification_id = (msg.time % (i32::MAX as i64)) as i32;

                                    match app_clone.notification()
                                        .builder()
                                        .id(notification_id)
                                        .title(&title)
                                        .body(&body)
                                        .show()
                                    {
                                        Ok(_) => println!("Notification sent to OS: {}", msg.id),
                                        Err(e) => eprintln!("Notification error: {}", e),
                                    }

                                    #[derive(Serialize, Clone)]
                                    struct FrontendMessage {
                                        server_url: String,
                                        message: NtfyMessage,
                                    }

                                    let payload = FrontendMessage {
                                        server_url: base_url_clone.clone(),
                                        message: msg,
                                    };

                                    let _ = app_clone.emit("new-message", &payload);
                                }
                            }
                        }
                        Err(err) => {
                            println!("SSE Error for {}: {}", sse_url, err);
                            es.close();
                            break; 
                        }
                    }
                }
            }
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

    if let Some(handle) = subs.remove(&full_url) {
        handle.abort();
    }

    Ok(())
}
