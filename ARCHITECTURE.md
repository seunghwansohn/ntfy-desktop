# System Architecture

## 1. High-Level Architecture
The application is built using the **Tauri** framework, which provides a lightweight, secure, and fast desktop application utilizing web technologies for the frontend and Rust for the backend.

- **Frontend (UI):** React, TypeScript, Vite, Tailwind CSS. Responsible for rendering the UI, managing user inputs (subscribing, publishing), and communicating with the Rust backend via Tauri IPC (Inter-Process Communication).
- **Backend (Core):** Rust. Responsible for native system interactions (System Tray, Notifications), maintaining persistent connections to the ntfy server, and handling background tasks.

## 2. Component Design

### 2.1. Rust Backend (Tauri Core)
- **`main.rs`:** Entry point. Initializes the Tauri application, sets up the System Tray, and registers IPC command handlers.
- **System Tray Module:** Manages the tray icon, context menu, and window visibility toggle events. Intercepts the window close event (`tauri::WindowEvent::CloseRequested`) to hide the window instead of exiting.
- **Notification Module:** Uses `tauri::api::notification` to trigger native Windows toast notifications.
- **ntfy Client Module:** Manages persistent Server-Sent Events (SSE) connections to the ntfy server using `reqwest` and `futures-util`. Runs asynchronously (using `tokio`) in the background to receive messages even when the frontend webview is suspended or hidden.
- **State Management:** Thread-safe state (`std::sync::Mutex` or `tokio::sync::RwLock`) to hold active subscriptions, credentials, and app configuration.

### 2.2. Frontend (React)
- **State Management:** React Context or Zustand for managing UI state (subscribed topics, message history).
- **UI Components:**
  - `Sidebar`: List of subscribed topics.
  - `MessageList`: History of received messages for the selected topic.
  - `PublishForm`: Input fields to send new messages.
  - `Settings`: Configuration for server URL, credentials, etc.
- **Tauri IPC:** Uses `@tauri-apps/api/invoke` to send commands to Rust (e.g., `add_subscription`, `publish_message`) and `@tauri-apps/api/event` to receive real-time messages from Rust.

## 3. Data Flow (Message Reception)
1. Rust backend establishes an SSE connection to `ntfy.sh/<topic>/sse`.
2. ntfy server pushes a new message event.
3. Rust SSE client receives the event.
4. Rust backend triggers a native Windows notification.
5. Rust backend emits a Tauri event (e.g., `new-message`) with the payload to the frontend.
6. React frontend listens for `new-message`, updates the local state, and re-renders the `MessageList`.

## 4. Connection Resilience
The Rust backend will implement an exponential backoff retry mechanism to reconnect to the ntfy server in case of network interruptions.
