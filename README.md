# ModuShare – Cross-Platform Clipboard Sync
# ModuShare – 크로스 플랫폼 클립보드 동기화

> **Copy once, paste everywhere.**
> **한 번 복사하면, 어디서나 붙여넣기.**

ModuShare keeps your clipboard in sync across macOS, Windows, and any web browser in real time using WebSockets.

---

## Table of Contents / 목차

1. [What is ModuShare?](#what-is-modushare)
2. [Architecture](#architecture)
3. [Quick Start (Server + Web)](#quick-start)
4. [Configuration](#configuration)
5. [Web Frontend](#web-frontend)
6. [macOS Client](#macos-client)
7. [Windows Client](#windows-client)
8. [API Reference](#api-reference)
9. [한국어 가이드](#한국어-가이드)

---

## What is ModuShare?

ModuShare is a self-hosted service that mirrors your clipboard across all your devices:

- **Text** is transmitted inline over WebSocket (< 5 MB by default).
- **Images** ≤ 512 KB are sent as base64 inline; larger images are uploaded via the REST API first, then the URL is broadcast.
- A **write-back loop guard** prevents a received clipboard update from being re-sent to the server.
- All connections are authenticated with **JWT access tokens** (15 min) + **rotating refresh tokens** (30 days, HttpOnly cookie).
- Storage is **SQLite** via `better-sqlite3` – no separate database server required.

---

## Architecture

```
┌─────────────┐        WebSocket        ┌───────────────────────┐
│  macOS App  │◄──────────────────────►│                       │
├─────────────┤                         │   Node.js / Express   │
│ Windows App │◄──────────────────────►│   + WS Server         │
├─────────────┤        REST API         │   + SQLite            │
│  Web (React)│◄──────────────────────►│   + File Storage      │
└─────────────┘                         └───────────────────────┘
```

```
modushare/
├── shared/          # Shared TypeScript types (WSMessage, ClipboardItem, …)
├── server/          # Express + WebSocket backend
├── web/             # React + Vite frontend
└── clients/
    ├── macos/       # Swift menu-bar app
    └── windows/     # Electron tray app
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### 1. Clone & install

```bash
git clone https://github.com/your-org/modushare.git
cd modushare
npm install          # installs all workspaces
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set a strong JWT_SECRET
```

### 3. Start development servers

```bash
npm run dev          # starts server (port 3000) + web (port 5173) concurrently
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Docker Compose (production)

```bash
cp .env.example .env
# Edit .env
docker compose up -d
```

- Web UI:  [http://localhost:5173](http://localhost:5173)
- API:     [http://localhost:3000](http://localhost:3000)

---

## Configuration

### Root `.env`

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | *(required)* | Secret for signing JWTs – **change this!** |
| `PORT` | `3000` | HTTP/WS server port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `MAX_CLIPBOARD_SIZE_MB` | `5` | Max text/image size |

### Server `.env` (additional)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `./data/modushare.db` | SQLite file path |
| `UPLOAD_DIR` | `./uploads` | Directory for uploaded images |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | `30d` | Refresh token lifetime |

---

## Web Frontend

The web frontend is a React SPA built with Vite.

### Features

- Login / Registration
- Real-time clipboard feed via WebSocket
- Copy any item back to your local clipboard with one click
- Delete items
- Sync on/off toggle
- Image preview with zoom

### Running

```bash
npm run dev:web      # http://localhost:5173
```

### Building for production

```bash
npm run build:web    # outputs to web/dist/
```

The server automatically serves `web/dist` in production mode.

---

## macOS Client

A menu-bar app written in Swift (AppKit + URLSessionWebSocketTask).

### Requirements

- macOS 13 Ventura or later
- Xcode 15 or later

### Building

1. Open Xcode and create a new **macOS App** project.
2. Set Bundle Identifier to `com.modushare.app`.
3. Add all `.swift` files from `clients/macos/ModuShare/`.
4. Replace the generated `Info.plist` with the one provided.
5. In *Signing & Capabilities*, add a custom entitlements file pointing to `ModuShare.entitlements`.
6. Build & Run (⌘R).

### Usage

- The app runs in the **menu bar only** (no Dock icon).
- On first launch, a login window appears.
- After sign-in, the clipboard is polled every 500 ms.
- Menu bar icon → **Enable/Disable Sync**, **Sign Out**, **Quit**.
- Server URL defaults to `http://localhost:3000`. Change it via `AuthManager.shared.serverURL`.

---

## Windows Client

An Electron tray app written in TypeScript.

### Requirements

- Node.js 20+
- Windows 10 or later (also works on macOS/Linux for development)

### Development

```bash
cd clients/windows
npm install
npm run dev          # compiles TypeScript then launches Electron
```

### Building a distributable

```bash
npm run build        # produces an NSIS installer in dist/
```

### Usage

- The app runs as a **system tray** icon.
- Right-click the tray icon for the menu: **Enable/Disable Sync**, **View History**, **Preferences**, **Quit**.
- On first launch (or when not signed in) a login window opens automatically.
- Clipboard is polled every 500 ms.
- Large images (> 512 KB) are skipped with a console warning (upload support coming in a future release).

---

## API Reference

### Authentication

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create account `{username, email, password}` |
| `POST` | `/auth/login` | Sign in `{email, password}` → `{accessToken, user}` |
| `POST` | `/auth/refresh` | Rotate refresh token (cookie) → `{accessToken}` |
| `POST` | `/auth/logout` | Revoke refresh token |
| `GET`  | `/auth/me` | Get current user |

### Clipboard

| Method | Path | Description |
|---|---|---|
| `GET`  | `/clipboard/history?limit=50&offset=0` | Paginated history |
| `DELETE` | `/clipboard/:id` | Soft-delete an item |

### Upload

| Method | Path | Description |
|---|---|---|
| `POST` | `/upload/image` | Upload image (multipart/form-data, field: `image`) |
| `GET`  | `/uploads/:userId/:filename` | Download image (auth required) |

### WebSocket

Connect to `ws://host:3000` with header:

```
Sec-WebSocket-Protocol: modushare, <access_token>
```

#### Message envelope

```json
{
  "type": "CLIPBOARD_UPDATE | SYNC_ENABLE | SYNC_DISABLE | PING | PONG | ERROR | CLIPBOARD_ACK",
  "payload": { ... },
  "timestamp": 1712345678000,
  "deviceId": "uuid-of-sending-device"
}
```

#### Payload shapes

| Type | Payload |
|---|---|
| `CLIPBOARD_UPDATE` | `{ contentType: "text", content: "…" }` or `{ contentType: "image", imageData: "<base64>" }` or `{ contentType: "image", imageUrl: "/uploads/…" }` |
| `CLIPBOARD_ACK` | `{ itemId: "uuid" }` |
| `SYNC_ENABLE` / `SYNC_DISABLE` | *(no payload)* |
| `PING` / `PONG` | *(no payload)* |
| `ERROR` | `{ code: "STRING", message: "…" }` |

---

## 한국어 가이드

### ModuShare란?

ModuShare는 자기 서버에서 실행하는 **클립보드 동기화 서비스**입니다.
macOS, Windows, 웹 브라우저 간에 복사한 내용을 실시간으로 공유합니다.

- **텍스트**: WebSocket을 통해 직접 전송 (기본 최대 5 MB)
- **이미지**: 512 KB 이하는 base64 인라인 전송, 이상은 REST API로 먼저 업로드 후 URL 전달
- **에코 방지**: 서버에서 받은 클립보드를 로컬에 쓸 때 재전송 방지 처리
- **인증**: JWT 액세스 토큰(15분) + 순환 갱신 토큰(30일, HttpOnly 쿠키)
- **저장소**: SQLite (`better-sqlite3`) – 별도 DB 서버 불필요

---

### 빠른 시작 (서버 + 웹)

#### 1. 설치

```bash
git clone https://github.com/your-org/modushare.git
cd modushare
npm install
```

#### 2. 환경 변수 설정

```bash
cp .env.example .env
# .env 파일을 열어 JWT_SECRET을 강력한 값으로 변경하세요
```

#### 3. 개발 서버 실행

```bash
npm run dev
# 서버: http://localhost:3000
# 웹:   http://localhost:5173
```

#### 4. Docker로 프로덕션 배포

```bash
docker compose up -d
```

---

### 웹 프론트엔드 사용법

1. 브라우저에서 `http://localhost:5173` 접속
2. 계정 등록 또는 로그인
3. 클립보드 히스토리가 실시간으로 표시됨
4. **복사 버튼**: 해당 항목을 다시 클립보드에 복사
5. **삭제 버튼**: 서버에서 항목 삭제
6. **Sync 토글**: 동기화 활성화/비활성화

---

### macOS 클라이언트 빌드 및 설치

#### 요구사항

- macOS 13 Ventura 이상
- Xcode 15 이상

#### 빌드 방법

1. Xcode에서 새 **macOS App** 프로젝트 생성
2. Bundle Identifier를 `com.modushare.app`으로 설정
3. `clients/macos/ModuShare/` 폴더의 모든 `.swift` 파일 추가
4. `Info.plist`를 제공된 파일로 교체
5. *Signing & Capabilities*에서 `ModuShare.entitlements` 추가
6. 빌드 및 실행 (⌘R)

#### 사용 방법

- 앱은 **메뉴 바**에서만 실행됨 (Dock 아이콘 없음)
- 처음 실행 시 로그인 창이 열림
- 로그인 후 500ms마다 클립보드 감시 시작
- 메뉴 바 아이콘 클릭 → 동기화 ON/OFF, 로그아웃, 종료

---

### Windows 클라이언트 빌드 및 설치

#### 요구사항

- Node.js 20 이상
- Windows 10 이상

#### 개발 모드

```bash
cd clients/windows
npm install
npm run dev
```

#### 설치 파일 빌드

```bash
npm run build
# dist/ 폴더에 NSIS 인스톨러 생성
```

#### 사용 방법

- 앱은 **시스템 트레이**에서 실행됨
- 트레이 아이콘 우클릭 → 메뉴 사용
- 동기화 ON/OFF, 히스토리 보기 (브라우저), 환경설정, 종료
- 처음 실행 시 또는 미로그인 상태에서 자동으로 로그인 창 열림

---

### 설정 옵션

| 변수 | 기본값 | 설명 |
|---|---|---|
| `JWT_SECRET` | *(필수)* | JWT 서명 키 – **반드시 변경하세요!** |
| `PORT` | `3000` | 서버 포트 |
| `CORS_ORIGIN` | `http://localhost:5173` | 허용 CORS 출처 |
| `MAX_CLIPBOARD_SIZE_MB` | `5` | 최대 텍스트/이미지 크기 |
| `DATABASE_URL` | `./data/modushare.db` | SQLite 파일 경로 |
| `UPLOAD_DIR` | `./uploads` | 업로드 이미지 저장 경로 |

---

## License

MIT © ModuShare Contributors
