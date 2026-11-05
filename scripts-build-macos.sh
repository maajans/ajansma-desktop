#!/usr/bin/env bash
# macOS üzerinde derleme (Xcode Command Line Tools + Rust + Node gerekir)
set -euo pipefail
cd "$(dirname "$0")"
npm install
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npx tauri build --target universal-apple-darwin
APP="src-tauri/target/universal-apple-darwin/release/bundle/macos/MA Haber Merkezi.app"
codesign --force --deep --sign - "$APP"
echo "DMG: src-tauri/target/universal-apple-darwin/release/bundle/dmg/"
