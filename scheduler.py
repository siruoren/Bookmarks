"""定时任务模块"""
import threading
import time
import logging
from typing import Callable

logger = logging.getLogger(__name__)


class Scheduler:
    """简单的定时任务调度器"""

    def __init__(self, interval_minutes: int, task: Callable, enabled: bool = True):
        self.interval = interval_minutes * 60
        self.task = task
        self.enabled = enabled
        self._timer = None
        self._running = False

    def _run(self):
        """执行任务并安排下一次"""
        if not self._running:
            return
        try:
            logger.info("执行定时同步任务")
            self.task()
        except Exception as e:
            logger.error("定时任务执行失败: %s", e)
        if self._running:
            self._timer = threading.Timer(self.interval, self._run)
            self._timer.daemon = True
            self._timer.start()

    def start(self):
        """启动定时任务"""
        if not self.enabled:
            logger.info("定时任务未启用")
            return
        self._running = True
        logger.info("定时任务已启动，间隔 %d 秒", self.interval)
        self._timer = threading.Timer(self.interval, self._run)
        self._timer.daemon = True
        self._timer.start()

    def stop(self):
        """停止定时任务"""
        self._running = False
        if self._timer:
            self._timer.cancel()
        logger.info("定时任务已停止")
