"""Flask Web应用 - Bookmarks导航页"""
import json
import os
import time
import logging
import threading
from typing import List, Dict, Optional

from flask import Flask, jsonify, render_template, request
from parser import parse_bookmarks, search_bookmarks
from git_sync import GitSync
from scheduler import Scheduler

logger = logging.getLogger(__name__)

app = Flask(__name__)

# API Key 认证（可选，配置后对 /api/* 路由生效）
api_key: str = ""


@app.before_request
def check_api_key():
    """API Key 认证中间件：仅对 /api/ 路由生效，未配置 api_key 则放行"""
    if not api_key or not request.path.startswith("/api/"):
        return
    key = request.headers.get("X-API-Key", "")
    if key != api_key:
        return jsonify({"error": "Unauthorized", "message": "API Key 不正确"}), 401


# 全局状态
bookmarks_data: List[Dict] = []
last_update: float = 0
git_sync: Optional[GitSync] = None
scheduler: Optional[Scheduler] = None
recent_items: Dict[str, List[Dict]] = {}  # 改为按设备ID存储的字典（缓存）
recent_max: int = 20
recent_data_dir: str = "./data/recent"
# 文件修改时间跟踪
bookmark_file_mtimes: Dict[str, float] = {}

# 配置热加载相关
config_path: str = "config.yml"
config_mtime: float = 0
config_lock = threading.Lock()


def load_config(path: str = "config.yml") -> dict:
    """加载YAML配置文件"""
    import yaml
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_recent_file_path(device_id: str) -> str:
    """获取指定设备的最近访问记录文件路径"""
    return os.path.join(recent_data_dir, f"{device_id}.json")


def load_recent():
    """加载最近访问记录"""
    global recent_items
    try:
        # 确保目录存在
        os.makedirs(recent_data_dir, exist_ok=True)
        
        # 加载设备文件
        recent_items = {}
        for filename in os.listdir(recent_data_dir):
            if filename.endswith('.json'):
                device_id = filename[:-5]  # 移除 .json
                try:
                    with open(os.path.join(recent_data_dir, filename), "r", encoding="utf-8") as f:
                        recent_items[device_id] = json.load(f)
                except Exception as e:
                    logger.warning("加载设备 %s 的最近访问记录失败: %s", device_id, e)
                    
    except Exception as e:
        logger.warning("加载最近访问记录失败: %s", e)
        recent_items = {}


def save_device_recent(device_id: str, items: List[Dict]):
    """保存指定设备的最近访问记录"""
    try:
        os.makedirs(recent_data_dir, exist_ok=True)
        with open(get_recent_file_path(device_id), "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning("保存设备 %s 的最近访问记录失败: %s", device_id, e)


def add_recent(title: str, url: str, category: str = "", device_id: str = "default"):
    """添加最近访问项"""
    global recent_items
    if device_id not in recent_items:
        recent_items[device_id] = []
    
    device_items = recent_items[device_id]
    device_items = [r for r in device_items if r["url"] != url]
    device_items.insert(0, {
        "title": title,
        "url": url,
        "category": category,
        "timestamp": int(time.time())
    })
    device_items = device_items[:recent_max]
    recent_items[device_id] = device_items
    save_device_recent(device_id, device_items)


def get_device_recent(device_id: str) -> List[Dict]:
    """获取指定设备的最近访问记录"""
    return recent_items.get(device_id, [])


def refresh_bookmarks() -> bool:
    """刷新书签数据(从git同步并重新解析)
    
    Returns:
        bool: 是否执行了实际的解析更新
    """
    global bookmarks_data, last_update, bookmark_file_mtimes
    
    if git_sync:
        try:
            git_sync.sync()
        except Exception as e:
            logger.warning("Git同步失败(将使用本地文件): %s", e)

    config = getattr(app, "config_data", {})
    bookmark_files = config.get("git", {}).get("bookmark_files", [])
    
    # 检查文件是否有变更
    has_changes = False
    files_to_parse = []
    
    for bf in bookmark_files:
        fpath = None
        if git_sync:
            fpath = git_sync.get_file_path(bf)
        if not fpath and os.path.isfile(bf):
            fpath = bf
        
        if fpath and os.path.isfile(fpath):
            try:
                current_mtime = os.path.getmtime(fpath)
                if fpath not in bookmark_file_mtimes or bookmark_file_mtimes[fpath] != current_mtime:
                    has_changes = True
                    files_to_parse.append(fpath)
                    bookmark_file_mtimes[fpath] = current_mtime
            except Exception as e:
                logger.warning("获取文件修改时间失败 %s: %s", fpath, e)
                # 无法获取修改时间时，默认需要解析
                has_changes = True
                files_to_parse.append(fpath)
    
    if not has_changes:
        logger.info("书签文件无变更，跳过解析")
        return False
    
    logger.info("检测到书签文件变更，开始解析")
    
    new_data = []
    for fpath in files_to_parse:
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
    
    return True


def apply_config(config: dict):
    """应用配置到全局状态(热加载核心)"""
    global git_sync, scheduler, recent_max, api_key

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

        # API Key 认证（可选）
        api_key = config.get("api_key", "")

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
            updated = refresh_bookmarks()
            if not updated:
                logger.info("定时任务: 书签无变更，跳过解析")

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


@app.route("/api/update_time")
def api_update_time():
    """获取后端更新时间"""
    return jsonify({"last_update": last_update})


@app.route("/api/bookmarks")
def api_bookmarks():
    """获取所有书签数据"""
    keyword = request.args.get("q", "").strip()
    data = search_bookmarks(bookmarks_data, keyword) if keyword else bookmarks_data
    return jsonify({
        "categories": data,
        "last_update": last_update,
        "total": sum(len(c["items"]) for c in data)
    })


@app.route("/api/recent", methods=["GET"])
def api_recent():
    """获取最近常用项"""
    device_id = request.args.get("device_id", "")
    return jsonify({"items": get_device_recent(device_id) if device_id else []})


@app.route("/api/visit", methods=["POST"])
def api_visit():
    """记录访问(用于最近常用)"""
    data = request.get_json(silent=True) or {}
    title, url, category = data.get("title", ""), data.get("url", ""), data.get("category", "")
    device_id = data.get("device_id", "default")
    if title and url:
        add_recent(title, url, category, device_id)
    return jsonify({"ok": True})


@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    """手动触发刷新"""
    refresh_bookmarks()
    return jsonify({"ok": True, "last_update": last_update})


@app.route("/api/recent/delete", methods=["POST"])
def api_recent_delete():
    """删除最近常用项"""
    data = request.get_json(silent=True) or {}
    url = data.get("url", "")
    device_id = data.get("device_id", "default")
    if url and device_id in recent_items:
        recent_items[device_id] = [r for r in recent_items[device_id] if r["url"] != url]
        save_device_recent(device_id, recent_items[device_id])
    return jsonify({"ok": True})


@app.route("/api/config/reload", methods=["POST"])
def api_config_reload():
    """手动触发配置热加载"""
    try:
        check_config_hot_reload()
        return jsonify({"ok": True, "message": "配置已重新加载"})
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500
