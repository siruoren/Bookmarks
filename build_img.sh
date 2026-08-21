#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 从 version.txt 读取版本号
VERSION=$(cat "$SCRIPT_DIR/version.txt" | tr -d '[:space:]')
if [ -z "$VERSION" ]; then
  echo "错误: version.txt 为空或不存在"
  exit 1
fi

echo "==> Docker tag: seetab:${VERSION}（来源: version.txt）"
docker build -t "seetab:${VERSION}" "$SCRIPT_DIR"
echo "==> 构建完成: seetab:${VERSION}"
