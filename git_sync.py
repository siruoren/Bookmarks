"""Git仓库同步模块"""
import os
import subprocess
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class GitSync:
    """管理从远程Git仓库同步bookmarks文件"""

    def __init__(self, repo_url: str, local_dir: str, branch: str = "master",
                 ssh_key_path: Optional[str] = None):
        self.repo_url = repo_url
        self.local_dir = os.path.abspath(local_dir)
        self.branch = branch
        self.ssh_key_path = os.path.expanduser(ssh_key_path) if ssh_key_path else None

    def _get_env(self):
        """构建子进程环境变量，注入SSH密钥"""
        env = os.environ.copy()
        if self.ssh_key_path and os.path.exists(self.ssh_key_path):
            # 限制SSH只使用指定密钥，禁用严格主机检查
            env["GIT_SSH_COMMAND"] = (
                f"ssh -i {self.ssh_key_path} -o StrictHostKeyChecking=no"
            )
        return env

    def _run_git(self, args: list, cwd: Optional[str] = None) -> subprocess.CompletedProcess:
        """执行git命令"""
        env = self._get_env()
        cmd = ["git"] + args
        logger.info("执行: %s", " ".join(cmd))
        return subprocess.run(
            cmd, cwd=cwd or self.local_dir, env=env,
            capture_output=True, text=True, timeout=120
        )

    def clone(self) -> bool:
        """克隆远程仓库"""
        os.makedirs(os.path.dirname(self.local_dir), exist_ok=True)
        result = self._run_git(
            ["clone", "-b", self.branch, self.repo_url, self.local_dir],
            cwd=os.path.dirname(self.local_dir)
        )
        if result.returncode != 0:
            logger.error("克隆失败: %s", result.stderr)
            return False
        logger.info("克隆成功: %s", self.local_dir)
        return True

    def pull(self) -> bool:
        """拉取远程更新"""
        result = self._run_git(["pull", "--ff-only", "origin", self.branch])
        if result.returncode != 0:
            logger.error("拉取失败: %s", result.stderr)
            return False
        if "Already up to date" in result.stdout:
            logger.info("仓库已是最新")
        else:
            logger.info("拉取更新成功")
        return True

    def sync(self) -> bool:
        """同步仓库(自动判断clone或pull)"""
        if os.path.isdir(os.path.join(self.local_dir, ".git")):
            return self.pull()
        return self.clone()

    def get_file_path(self, relative_path: str) -> Optional[str]:
        """获取仓库中文件的完整路径"""
        full_path = os.path.join(self.local_dir, relative_path)
        return full_path if os.path.isfile(full_path) else None
