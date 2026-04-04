# iMessanger 📹🔊

Real-time video and audio calling application. Built with modern technologies for local network and web communication.

## 🚀 Features
- **One-on-One Calls**: Real-time video/audio streaming via WebRTC.
- **Easy Joining**: Simple room-code system (e.g., `ABC123`).
- **Local Network Support**: Configured for local IP and HTTPS access.
- **Modern Stack**: Java 26 (Preview) + Spring Boot 4 + React 18 + Vite.

## 🛠 Tech Stack
- **Backend**: Spring Boot 4, WebSocket (Signaling), Java 26.
- **Frontend**: React, Vite, WebRTC.
- **Styling**: Vanilla CSS with a premium design aesthetic.

## 📦 Project Structure
- `/server`: Spring Boot signaling server.
- `/web`: React/Vite frontend application.
- `/pom.xml`: Root Maven configuration for multi-module build.

## 🚦 Getting Started
### Prerequisites
- **JDK 26** installed.
- **Maven** (configured at `C:\opt\apache-maven-3.9.12` or available in PATH).

## ⚡ One-Click Launch
The project includes a PowerShell script `launch.ps1` that automates building, starting both servers, and opening the browser.

### How to run:
1. Open PowerShell.
2. Navigate to the project root: `cd c:\Users\slaff\projects\iMessanger`
3. Run the script:
   ```powershell
   .\launch.ps1
   ```
   *(Note: You might need to allow script execution: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` if it fails)*

### Manual Running
If you prefer running manually:
1. **Build**: `mvn clean install -DskipTests`
2. **Backend**: `mvn spring-boot:run -pl server`
3. **Frontend**: `cd web; npm run dev -- --host`

### 🔒 HTTPS & WebRTC
The project uses `@vitejs/plugin-basic-ssl` to enable HTTPS in the local network. This is required by browsers to allow camera/microphone access on non-localhost origins.
- Access URL: `https://[local-IP]:5173/`
- Certificate: Self-signed (Accept the browser's "Advanced" warning to proceed).

## 📄 License
MIT License. Created by [slaffka85](https://github.com/slaffka85/).
