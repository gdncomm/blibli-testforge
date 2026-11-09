#!/bin/bash
# Builds the Swift package and wraps it into build/TestForge.app (no Xcode project needed).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONFIG="${1:-release}"
swift build -c "$CONFIG"
BIN_DIR="$(swift build -c "$CONFIG" --show-bin-path)"

APP="$ROOT/build/TestForge.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_DIR/TestForge" "$APP/Contents/MacOS/TestForge"

# String(localized:) reads Bundle.main, so the compiled .lproj folders go in the app's own Resources.
RESOURCE_BUNDLE="$BIN_DIR/TestForge_TestForge.bundle"
if [ -d "$RESOURCE_BUNDLE" ]; then
	find "$RESOURCE_BUNDLE" -maxdepth 2 -name "*.lproj" -type d -exec cp -R {} "$APP/Contents/Resources/" \;
fi

# App icon (R4g): Assets/AppIcon-1024.png (drawn by scripts/make-icon.swift) → every size macOS asks for → AppIcon.icns.
ICON_SOURCE="$ROOT/Assets/AppIcon-1024.png"
if [ -f "$ICON_SOURCE" ]; then
	ICONSET="$(mktemp -d)/AppIcon.iconset"
	mkdir -p "$ICONSET"
	for size in 16 32 128 256 512; do
		sips -z "$size" "$size" "$ICON_SOURCE" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
		double=$((size * 2))
		sips -z "$double" "$double" "$ICON_SOURCE" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
	done
	iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
	rm -rf "$(dirname "$ICONSET")"
fi

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key><string>TestForge</string>
	<key>CFBundleIdentifier</key><string>com.blibli.test-forge</string>
	<key>CFBundleName</key><string>TestForge</string>
	<key>CFBundleDisplayName</key><string>TestForge</string>
	<key>CFBundlePackageType</key><string>APPL</string>
	<key>CFBundleShortVersionString</key><string>0.2</string>
	<key>CFBundleVersion</key><string>2</string>
	<key>CFBundleDevelopmentRegion</key><string>en</string>
	<key>CFBundleIconFile</key><string>AppIcon</string>
	<key>LSMinimumSystemVersion</key><string>14.0</string>
	<key>NSHighResolutionCapable</key><true/>
	<key>NSAppTransportSecurity</key>
	<dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict>
</plist>
PLIST

# Ad-hoc by default. macOS ties the Accessibility grant (Arrange, step outline, Measure) to the signature, and an
# ad-hoc one changes on every build, so the grant is lost. Set TEST_FORGE_SIGN_IDENTITY to a certificate name
# (`security find-identity -v -p codesigning`), or write it to ~/.test-forge/sign-identity, to keep it across rebuilds.
SIGN_IDENTITY_FILE="$HOME/.test-forge/sign-identity"
DEFAULT_IDENTITY="-"
if [ -f "$SIGN_IDENTITY_FILE" ]; then
	DEFAULT_IDENTITY="$(head -n 1 "$SIGN_IDENTITY_FILE")"
fi
SIGN_IDENTITY="${TEST_FORGE_SIGN_IDENTITY:-$DEFAULT_IDENTITY}"
codesign --force --sign "$SIGN_IDENTITY" "$APP" >/dev/null 2>&1 || echo "note: signing with '$SIGN_IDENTITY' failed; the app is unsigned"
echo "signed with: $SIGN_IDENTITY"
echo "built: $APP"
