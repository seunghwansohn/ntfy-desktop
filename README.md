# ntfy-desktop

A native desktop client for [ntfy](https://ntfy.sh/), built with Tauri, React, and Rust. 

Unlike the standard web app, `ntfy-desktop` runs persistently in the background (system tray) and provides reliable, OS-native push notifications across Windows, macOS, and Linux. It offers a familiar, messenger-like user experience for managing subscriptions and publishing messages.

## Features

- **Background Execution:** Minimizes to the system tray upon closing, ensuring you never miss a notification even when the app window is hidden.
- **Native OS Notifications:** Uses native desktop APIs (Toast on Windows, DBus/notify-send on Linux, macOS notifications) for immediate, reliable alerts.
- **Multiple Subscriptions:** Subscribe to and manage multiple topics simultaneously.
- **Self-Hosted Server Support:** Seamlessly connect to your own custom ntfy instances alongside `ntfy.sh`.
- **Messenger-like UI:** Clean, responsive interface built with React and Tailwind CSS v4, featuring unread message badges and topic-specific chat views.
- **Cross-Platform:** Built with Tauri for a lightweight and secure footprint across all major operating systems.

## Installation

You can download the pre-compiled installers for your operating system from the [Releases](https://github.com/seunghwansohn/ntfy-desktop/releases) page.

- **Windows:** Download the `.msi` or `.exe` installer.
- **Linux:** Download the `.deb` package or AppImage.

*Note: For the latest development builds, you can also check the Artifacts section in the GitHub Actions tab.*

## Development

To build and run this project locally, you will need:
- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (Recommended for dependency management)
- [Rust](https://www.rust-lang.org/tools/install)
- OS-specific dependencies for Tauri (see [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/))

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/seunghwansohn/ntfy-desktop.git
   cd ntfy-desktop
   ```

2. Install frontend dependencies (using pnpm):
   ```bash
   pnpm install
   ```

3. Run the development server:
   ```bash
   pnpm tauri dev
   ```

### Building for Production

To build the executable for your current operating system:

```bash
pnpm tauri build
```

The compiled binaries will be located in `src-tauri/target/release/bundle/`.

## Architecture

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons.
- **Backend/Core:** Rust, Tauri v2.
- **Communication:** 
  - Subscriptions and SSE (Server-Sent Events) are handled entirely in the Rust backend using `reqwest-eventsource` to guarantee background stability.
  - Tauri IPC (Inter-Process Communication) is used to sync state and trigger UI updates in the React frontend.

## License

This project is licensed under the MIT License.
