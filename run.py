"""启动入口"""
import logging
from app import app, init_app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

# 初始化(加载配置、同步git、启动定时任务)
init_app("config.yml")

# 启动Web服务
config = app.config_data
host = config.get("web", {}).get("host", "0.0.0.0")
port = config.get("web", {}).get("port", 5000)
debug = config.get("web", {}).get("debug", False)

app.run(host=host, port=port, debug=debug)
