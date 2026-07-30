"""Flask Web应用 - Bookmarks导航页"""
import json
import os
import time
import logging
import threading
from typing import List, Dict, Optional

from flask import Flask, jsonify, render_template, request
from parser import parse_bookmarks, search_bookmarks, flatten_bookmarks
from git_sync import GitSync
from scheduler import Scheduler

logger = logging.getLogger(__name__)

app = Flask(__name__)

# 全局状态
bookmarks_data: List[Dict] = []
last_update: float = 0
git_sync: Optional[GitSync] = None
scheduler: Optional[Scheduler] = None
recent_items: List[Dict] = []
recent_max: int = 20
recent_path: str = "./data/recent.json"

# 配置热加载相关
config_path: str = "config.yml"
config_mtime: float = 0
config_lock = threading.Lock()


def load_config(path: str = "config.yml") -> dict:
    """加载YAML配置文件"""
    import yaml
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_recent():
    """加载最近访问记录"""
    global recent_items
    try:
        if os.path.isfile(recent_path):
            with open(recent_path, "r", encoding="utf-8") as f:
                recent_items = json.load(f)
    except Exception as e:
        logger.warning("加载最近访问记录失败: %s", e)
        recent_items = []


def save_recent():
    """保存最近访问记录"""
    try:
        os.makedirs(os.path.dirname(recent_path), exist_ok=True)
        with open(recent_path, "w", encoding="utf-8") as f:
            json.dump(recent_items, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning("保存最近访问记录失败: %s", e)


def add_recent(title: str, url: str, category: str = ""):
    """添加最近访问项"""
    global recent_items
    recent_items = [r for r in recent_items if r["url"] != url]
    recent_items.insert(0, {
        "title": title,
        "url": url,
        "category": category,
        "timestamp": int(time.time())
    })
    recent_items = recent_items[:recent_max]
    save_recent()


def refresh_bookmarks():
    """刷新书签数据(从git同步并重新解析)"""
    global bookmarks_data, last_update
    if git_sync:
        try:
            git_sync.sync()
        except Exception as e:
            logger.warning("Git同步失败(将使用本地文件): %s", e)

    new_data = []
    config = getattr(app, "config_data", {})
    bookmark_files = config.get("git", {}).get("bookmark_files", [])

    for bf in bookmark_files:
        fpath = None
        if git_sync:
            fpath = git_sync.get_file_path(bf)
        if not fpath and os.path.isfile(bf):
            fpath = bf

        if fpath:
            try:
                data = parse_bookmarks(fpath)
                new_data.extend(data)
                logger.info("解析书签文件: %s, 共 %d 个分类", fpath, len(data))
            except Exception as e:
                logger.error("解析书签文件失败 %s: %s", fpath, e)

    if new_data:
        bookmarks_data = new_data
        last_update = time.time()
        logger.info("书签数据已更新, 共 %d 个分类", len(bookmarks_data))


def apply_config(config: dict):
    """应用配置到全局状态(热加载核心)"""
    global git_sync, scheduler, recent_max, recent_path

    with config_lock:
        app.config_data = config

        # 重新初始化git同步
        git_cfg = config.get("git", {})
        git_sync = GitSync(
            repo_url=git_cfg.get("repo_url", ""),
            local_dir=git_cfg.get("local_dir", "./data/repo"),
            branch=git_cfg.get("branch", "master"),
            ssh_key_path=git_cfg.get("ssh_key_path")
        )

        # 最近访问配置
        recent_cfg = config.get("recent", {})
        recent_max = recent_cfg.get("max_count", 20)
        new_recent_path = recent_cfg.get("storage_path", "./data/recent.json")
        if new_recent_path != recent_path:
            recent_path = new_recent_path
            load_recent()

        # 停止旧调度器
        if scheduler:
            scheduler.stop()

        # 启动新调度器(含配置热检测)
        sched_cfg = config.get("schedule", {})
        interval = sched_cfg.get("interval_minutes", 30)
        enabled = sched_cfg.get("enabled", False)

        # 定时任务: 先检测配置变更, 再同步书签
        def scheduled_task():
            check_config_hot_reload()
            refresh_bookmarks()

        scheduler = Scheduler(
            interval_minutes=interval,
            task=scheduled_task,
            enabled=enabled
        )
        scheduler.start()

        # 刷新书签
        refresh_bookmarks()


def check_config_hot_reload():
    """检测配置文件是否变更, 变更则热加载"""
    global config_mtime
    try:
        mtime = os.path.getmtime(config_path)
    except OSError:
        return

    if mtime != config_mtime:
        config_mtime = mtime
        logger.info("检测到配置文件变更, 正在热加载...")
        try:
            config = load_config(config_path)
            apply_config(config)
            logger.info("配置热加载完成")
        except Exception as e:
            logger.error("配置热加载失败: %s", e)


def init_app(path: str = "config.yml"):
    """初始化应用"""
    global config_path, config_mtime

    config_path = path
    config_mtime = os.path.getmtime(path)

    config = load_config(path)
    load_recent()
    apply_config(config)


# ========== 路由 ==========

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/bookmarks")
def api_bookmarks():
    """获取所有书签数据"""
    keyword = request.args.get("q", "").strip()
    if keyword:
        data = search_bookmarks(bookmarks_data, keyword)
    else:
        data = bookmarks_data
    return jsonify({
        "categories": data,
        "last_update": last_update,
        "total": sum(len(c["items"]) for c in data)
    })


@app.route("/api/recent")
def api_recent():
    """获取最近常用地址"""
    return jsonify({"items": recent_items})


@app.route("/api/visit", methods=["POST"])
def api_visit():
    """记录访问(用于最近常用)"""
    data = request.get_json(silent=True) or {}
    title = data.get("title", "")
    url = data.get("url", "")
    category = data.get("category", "")
    if title and url:
        add_recent(title, url, category)
    return jsonify({"ok": True})


@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    """手动触发刷新"""
    refresh_bookmarks()
    return jsonify({"ok": True, "last_update": last_update})


@app.route("/api/search")
def api_search():
    """全局搜索"""
    keyword = request.args.get("q", "").strip()
    if not keyword:
        return jsonify({"categories": [], "total": 0})
    data = search_bookmarks(bookmarks_data, keyword)
    return jsonify({
        "categories": data,
        "total": sum(len(c["items"]) for c in data)
    })


@app.route("/api/config/reload", methods=["POST"])
def api_config_reload():
    """手动触发配置热加载"""
    try:
        check_config_hot_reload()
        return jsonify({"ok": True, "message": "配置已重新加载"})
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500
