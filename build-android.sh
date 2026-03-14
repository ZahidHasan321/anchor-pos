#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JAVA_HOME="/usr/lib/jvm/java-21-openjdk"
ANDROID_HOME="${ANDROID_HOME:-/home/zahid/Android/Sdk}"
KEYSTORE_FILE="${SCRIPT_DIR}/release-key.jks"
STORE_PASSWORD="AutoPOS@2026"
KEY_ALIAS="release"
KEY_PASSWORD="AutoPOS@2026"

echo "--- Building Android APK ---"

cd "$SCRIPT_DIR"

echo "1. Building web assets (no compression)..."
BUILD_TARGET=capacitor VITE_BUILD_TARGET=capacitor pnpm build
find build/client -name "*.gz" -delete
rm -rf build/client/uploads

echo "2. Syncing Capacitor..."
npx cap sync android

echo "3. Building release APK..."
cd android
JAVA_HOME="$JAVA_HOME" ANDROID_HOME="$ANDROID_HOME" ./gradlew clean assembleRelease \
  -PRELEASE_STORE_FILE="$KEYSTORE_FILE" \
  -PRELEASE_STORE_PASSWORD="$STORE_PASSWORD" \
  -PRELEASE_KEY_ALIAS="$KEY_ALIAS" \
  -PRELEASE_KEY_PASSWORD="$KEY_PASSWORD"

cd "$SCRIPT_DIR"

VERSION=$(node -p "require('./package.json').version")
APK_DEST="Auto-POS-${VERSION}.apk"
cp "android/app/build/outputs/apk/release/app-release.apk" "$APK_DEST"

echo "4. Uploading to VPS..."
scp "$APK_DEST" "ahsan_ssh:/root/anchor-pos/downloads/Auto-POS.apk"

echo "--- Done: $APK_DEST uploaded to VPS ---"
