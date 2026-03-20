# ModuShare macOS Client

A lightweight menu-bar application that syncs your clipboard with ModuShare.

## Requirements

- macOS 13.0 (Ventura) or later
- Xcode 15 or later

## Setup

1. Open `ModuShare.xcodeproj` (or create a new macOS App project and add these source files).
2. Set the Bundle Identifier to `com.modushare.app`.
3. In Signing & Capabilities, add the entitlements from `ModuShare.entitlements`.
4. Build and run (⌘R).

## Usage

- The app lives in the menu bar (no Dock icon).
- On first launch a login window opens — enter your ModuShare credentials.
- After login the clipboard is monitored every 500 ms.
- Use the menu bar icon to enable/disable sync or quit.

## Configuration

The server URL defaults to `http://localhost:3000`. To change it, open the
`AuthManager.swift` file and adjust the default, or add a Preferences window
in a future release.
