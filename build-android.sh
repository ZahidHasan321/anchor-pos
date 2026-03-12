#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk}"
ANDROID_HOME="${ANDROID_HOME:-/home/zahid/Android/Sdk}"
KEYSTORE_FILE="${SCRIPT_DIR}/release-key.jks"

echo "--- Building Android APK ---"

# Require signing credentials
: "${ANDROID_KEYSTORE_PASSWORD:?Set ANDROID_KEYSTORE_PASSWORD}"
: "${ANDROID_KEY_ALIAS:?Set ANDROID_KEY_ALIAS}"
: "${ANDROID_KEY_PASSWORD:?Set ANDROID_KEY_PASSWORD}"

cd "$SCRIPT_DIR"

echo "1. Building web assets..."
CAPACITOR_BUILD=true pnpm build

echo "2. Removing .gz files (not supported by Android asset packager)..."
find build/client -name "*.gz" -delete

echo "3. Syncing Capacitor..."
npx cap sync android

echo "4. Cleaning previous Gradle build..."
cd android
JAVA_HOME="$JAVA_HOME" ANDROID_HOME="$ANDROID_HOME" ./gradlew clean

echo "5. Building release APK..."
JAVA_HOME="$JAVA_HOME" ANDROID_HOME="$ANDROID_HOME" ./gradlew assembleRelease \
  -PRELEASE_STORE_FILE="$KEYSTORE_FILE" \
  -PRELEASE_STORE_PASSWORD="$ANDROID_KEYSTORE_PASSWORD" \
  -PRELEASE_KEY_ALIAS="$ANDROID_KEY_ALIAS" \
  -PRELEASE_KEY_PASSWORD="$ANDROID_KEY_PASSWORD"

cd "$SCRIPT_DIR"

VERSION=$(node -p "require('./package.json').version")
APK_SRC="android/app/build/outputs/apk/release/app-release.apk"
APK_DEST="Auto-POS-${VERSION}.apk"
cp "$APK_SRC" "$APK_DEST"

echo "6. Uploading APK to VPS..."
scp "$APK_DEST" "ahsan_ssh:/root/anchor-pos/downloads/Auto-POS.apk"

echo "--- Done: $APK_DEST ---"
