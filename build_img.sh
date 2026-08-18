#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 从当前 git 分支名提取 tag（如 v1.2.0 或 1.2.0）
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "dev")
# 去除前缀 v/V
TAG="${BRANCH#v}"
TAG="${TAG#V}"
# main/master 分支使用 latest
if [ "$TAG" = "main" ] || [ "$TAG" = "master" ]; then
  TAG="latest"
fi

echo "==> Docker tag: seetab:${TAG}（分支: ${BRANCH}）"
docker build -t "seetab:${TAG}" "$SCRIPT_DIR"
echo "==> 构建完成: seetab:${TAG}"
