# Bookmarks Navigation

基于 Floccus + Git 的个人书签导航页，实现全平台、随时随地访问个人书签。

## 项目简介

本项目是一个轻量级的个人书签导航系统，通过 Floccus 浏览器插件将书签同步到 Git 仓库，自动解析并生成美观的导航页面。支持定时同步、智能搜索、响应式设计，让您在任何设备上都能快速访问常用书签。

## 核心特性

### 🔄 自动同步
- 支持 Floccus 浏览器插件同步书签到 Git 仓库
- 定时任务自动拉取最新书签（可配置间隔）
- 智能变更检测：仅在书签文件更新时才重新解析，节省资源

### 🎨 现代化界面
- 响应式设计，完美适配桌面、平板、手机
- 分类展示，支持全局搜索
- 美观的卡片式布局，支持 1-4 列自适应
- 网站图标自动加载（favicon）

### ⭐ 最近常用
- 自动记录访问历史
- 长按条目显示删除按钮
- 支持置顶功能，置顶项可拖拽排序
- 置顶项和未置顶项分组显示

### 🔍 强大搜索
- 实时搜索，支持标题和 URL 匹配
- 搜索结果高亮显示
- 搜索框图标化（小屏幕）

### ⚙️ 灵活配置
- YAML 配置文件，支持热加载
- 可配置 Git 仓库、分支、SSH 密钥
- 可配置定时任务间隔和启用状态
- 可配置最近常用最大数量

## 快速开始

### Docker 部署（推荐）

1. 克隆项目：
```bash
git clone <your-repo-url>
cd Bookmarks
```

2. 创建配置文件 `config.yml`：
```yaml
git:
  repo_url: "git@github.com:yourusername/bookmarks.git"
  local_dir: "./data/repo"
  branch: "master"
  ssh_key_path: "/root/.ssh/id_rsa"
  bookmark_files:
    - "bookmarks.html"

web:
  host: "0.0.0.0"
  port: 80
  debug: false

schedule:
  enabled: true
  interval_minutes: 30

recent:
  max_count: 20
  storage_path: "./data/recent.json"
```

3. 准备 SSH 密钥：
```bash
mkdir -p ssh-keys
cp ~/.ssh/id_rsa ssh-keys/
chmod 600 ssh-keys/id_rsa
```

4. 启动服务：
```bash
docker-compose up -d
```

访问 `http://localhost:5005` 即可使用。

### 本地部署

1. 安装依赖：
```bash
pip install -r requirements.txt
```

2. 创建配置文件 `config.yml`（同上，注意调整路径）

3. 启动服务：
```bash
python run.py
```

## Floccus 集成

### 1. 安装 Floccus 插件
在浏览器中安装 [Floccus 插件](https://addons.mozilla.org/en-US/firefox/addon/floccus/)（支持 Firefox、Chrome、Edge）

### 2. 配置 Floccus
1. 打开 Floccus 设置
2. 添加新的同步目标：
   - 类型：Git
   - 仓库 URL：你的 Git 仓库地址
   - 分支：master（或你配置的分支）
   - 文件路径：bookmarks.html（或你配置的文件名）
   - 认证方式：SSH（使用你的 SSH 密钥）

### 3. 同步书签
1. 在浏览器中整理书签
2. Floccus 自动同步到 Git 仓库
3. 导航页定时任务自动拉取更新
4. 刷新导航页即可看到最新书签

## 配置说明

### Git 配置
```yaml
git:
  repo_url: "Git仓库地址"
  local_dir: "本地克隆目录"
  branch: "分支名"
  ssh_key_path: "SSH私钥路径"
  bookmark_files:
    - "书签文件路径（支持多个）"
```

### Web 配置
```yaml
web:
  host: "监听地址"
  port: "监听端口"
  debug: "调试模式"
```

### 定时任务配置
```yaml
schedule:
  enabled: true  # 是否启用定时任务
  interval_minutes: 30  # 同步间隔（分钟）
```

### 最近常用配置
```yaml
recent:
  max_count: 20  # 最大记录数量
  storage_path: "./data/recent.json"  # 存储路径
```

## 项目结构

```
Bookmarks/
├── app.py              # Flask 主应用
├── scheduler.py        # 定时任务调度器
├── parser.py          # 书签文件解析器
├── git_sync.py        # Git 同步模块
├── run.py             # 启动入口
├── config.yml         # 配置文件
├── requirements.txt   # Python 依赖
├── Dockerfile         # Docker 镜像构建
├── docker-compose.yml # Docker 编排
├── templates/
│   └── index.html     # 前端页面
└── data/              # 数据目录（持久化）
```

## 技术栈

- **后端**：Python + Flask
- **前端**：原生 HTML/CSS/JavaScript
- **同步**：Git + SSH
- **容器化**：Docker + Docker Compose
- **书签同步**：Floccus 浏览器插件

## 功能详解

### 响应式设计
- **大屏**（≥1400px）：3-4 列布局，侧边栏加宽
- **中屏**（≤1024px）：2-3 列布局，侧边栏缩窄
- **小屏**（≤768px）：1-2 列布局，侧边栏隐藏，汉堡菜单
- **超小屏**（≤480px）：标题显示为图标，搜索图标化

### 最近常用操作
- **长按**：显示删除按钮（左上角）和置顶按钮（右上角）
- **点击删除**：移除该条目
- **点击置顶**：切换置顶状态，置顶项显示🔎图标
- **拖拽排序**：置顶项可拖拽调整顺序

### 智能同步
- 文件修改时间检测，避免无意义的重复解析
- Git 同步失败时使用本地文件，保证服务可用性
- 配置文件热加载，无需重启服务

## 常见问题

### 1. Git 同步失败
- 检查 SSH 密钥权限（应为 600）
- 确认 SSH 密钥已添加到 Git 仓库的 deploy keys
- 检查网络连接和仓库地址

### 2. 书签未更新
- 确认 Floccus 已同步到 Git 仓库
- 检查定时任务是否启用
- 手动点击刷新按钮强制更新

### 3. Docker 部署权限问题
- 确保 `data` 目录有写权限
- 检查 SSH 密钥挂载路径正确

## 开发计划

- [ ] 支持更多书签格式（Chrome、Firefox、Safari）
- [ ] 添加书签导入/导出功能
- [ ] 支持自定义主题
- [ ] 添加书签分类编辑功能
- [ ] 支持多用户

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！