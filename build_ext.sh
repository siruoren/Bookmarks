#!/bin/bash
# 打包浏览器扩展为 zip 安装包
# 用法: ./build_ext.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$SCRIPT_DIR/extension"
DIST_DIR="$SCRIPT_DIR/dist"
VERSION=$(grep '"version"' "$EXT_DIR/manifest.json" | sed -E 's/.*"version": *"([^"]+)".*/\1/')
PKG_NAME="bookmarks-new-tab-v${VERSION}.zip"

echo "==> 打包 Bookmarks New Tab v${VERSION}"

# 清理旧包
mkdir -p "$DIST_DIR"
rm -f "$DIST_DIR"/*.zip

# 打包（排除非必要文件）
cd "$EXT_DIR"
zip -r "$DIST_DIR/$PKG_NAME" \
  manifest.json \
  newtab.html newtab.css newtab.js \
  options.html options.css options.js \
  background.js \
  pinyin.js \
  icons/ \
  -x "*.DS_Store" "__MACOSX/*"

echo "==> 已生成: dist/$PKG_NAME"
echo "==> 安装方式:"
echo "    Chrome: 设置 → 扩展程序 → 开发者模式 → 加载已解压的扩展程序（选择 extension 目录）"
echo "    Edge:   设置 → 扩展 → 开发人员模式 → 加载解压缩的扩展（选择 extension 目录）"
echo "    或者将 zip 文件拖入扩展管理页面安装"
