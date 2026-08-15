#!/bin/bash
# 打包浏览器扩展为 zip 安装包（Chrome + Firefox）
# 用法: ./build_ext.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$SCRIPT_DIR/extension"
DIST_DIR="$SCRIPT_DIR/dist"
VERSION=$(grep '"version"' "$EXT_DIR/manifest.json" | sed -E 's/.*"version": *"([^"]+)".*/\1/')

# 公共文件列表
COMMON_FILES=(
  newtab.html newtab.css newtab.js
  options.html options.css options.js
  background.js
  pinyin.js
  icons/
)

mkdir -p "$DIST_DIR"

# === Chrome / Edge ===
echo "==> 打包 Chrome/Edge v${VERSION}"
PKG_CHROME="seetab-chrome-v${VERSION}.zip"
rm -f "$DIST_DIR/$PKG_CHROME"
cd "$EXT_DIR"
zip -r "$DIST_DIR/$PKG_CHROME" \
  manifest.json \
  "${COMMON_FILES[@]}" \
  -x "*.DS_Store" "__MACOSX/*"
echo "    已生成: dist/$PKG_CHROME"

# === Firefox ===
echo "==> 打包 Firefox v${VERSION}"
PKG_FIREFOX="seetab-firefox-v${VERSION}.zip"
rm -f "$DIST_DIR/$PKG_FIREFOX"
TMP_DIR=$(mktemp -d)
# 复制文件并替换 manifest
cp "${COMMON_FILES[@]/#/$EXT_DIR\/}" "$TMP_DIR/" 2>/dev/null || true
cp "$EXT_DIR/newtab.html" "$TMP_DIR/"
cp "$EXT_DIR/newtab.css" "$TMP_DIR/"
cp "$EXT_DIR/newtab.js" "$TMP_DIR/"
cp "$EXT_DIR/options.html" "$TMP_DIR/"
cp "$EXT_DIR/options.css" "$TMP_DIR/"
cp "$EXT_DIR/options.js" "$TMP_DIR/"
cp "$EXT_DIR/background.js" "$TMP_DIR/"
cp "$EXT_DIR/background-firefox.js" "$TMP_DIR/"
cp "$EXT_DIR/pinyin.js" "$TMP_DIR/"
cp -r "$EXT_DIR/icons" "$TMP_DIR/"
cp "$EXT_DIR/manifest-firefox.json" "$TMP_DIR/manifest.json"
cd "$TMP_DIR"
zip -r "$DIST_DIR/$PKG_FIREFOX" . -x "*.DS_Store" "__MACOSX/*"
rm -rf "$TMP_DIR"
echo "    已生成: dist/$PKG_FIREFOX"

echo ""
echo "==> 安装方式:"
echo "    Chrome/Edge: 将 zip 拖入 chrome://extensions 页面安装"
echo "    Firefox:     将 zip 拖入 about:addons 页面安装"
