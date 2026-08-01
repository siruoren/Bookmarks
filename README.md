# Bookmarks Navigation

基于 Git 同步的个人书签导航系统，包含后端 API 服务和浏览器扩展（兼容 Chrome / Edge），实现全平台书签导航。

## 项目简介

本项目由两部分组成：

- **后端服务**（Flask）：从 Git 仓库同步书签文件并解析，提供 RESTful API
- **浏览器扩展**：覆盖新标签页，从后端获取书签并展示为美观的导航页，支持 Bing 每日壁纸、天气、主题切换等

## 核心特性

### 浏览器扩展

- 覆盖新标签页，替代默认空白页
- Bing 每日壁纸背景（可在设置中开关）
- 暗色/亮色主题切换
- 天气显示（可配置城市）
- 实时时钟 + 日历 + 农历
- 目录标签式展示，点击展开书签
- 书签实时搜索过滤
- 搜索引擎搜索（支持 Bing / Google / 百度，可配置）
- 毛玻璃风格卡片
- 后台定时增量同步（先检查更新时间，有更新才拉取）
- 所有配置存储在 chrome.storage，清除浏览器缓存不影响设置
- 兼容 Chrome 和 Edge（Manifest V3）

### 后端服务

- Floccus 浏览器插件同步书签到 Git 仓库
- 定时任务自动拉取最新书签
- 智能变更检测：仅在书签文件更新时才重新解析
- API Key 认证保护
- 配置热加载，无需重启
- 最近访问记录（按设备隔离）

## 快速开始

### 1. 部署后端服务

#### Docker 部署（推荐）

```bash
git clone <your-repo-url>
cd Bookmarks
```

创建配置文件 `config.yml`：

```yaml
git:
  repo_url: "git@github.com:yourusername/bookmarks.git"
  local_dir: "./data/repo"
  branch: "master"
  ssh_key_path: "/root/.ssh/id_rsa"
  bookmark_files:
    - "bookmarks.html"

schedule:
  enabled: true
  interval_minutes: 30

recent:
  max_count: 20

api_key: ""  # 可选，设置后所有 /api/* 请求需携带 X-API-Key 头
```

准备 SSH 密钥并启动：

```bash
mkdir -p ssh-keys
cp ~/.ssh/id_rsa ssh-keys/
chmod 600 ssh-keys/id_rsa
docker-compose up -d
```

访问 `http://localhost:5005` 即可使用 Web 版。

#### 本地部署

```bash
pip install -r requirements.txt
python run.py
```

### 2. 安装浏览器扩展

#### 开发者模式加载（推荐）

1. 打开浏览器扩展管理页：
   - Chrome：`chrome://extensions/`
   - Edge：`edge://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」/「加载解压缩的扩展」
4. 选择项目中的 `extension` 目录

#### 打包安装

```bash
./build_ext.sh
```

生成的 `dist/bookmarks-new-tab-vX.X.X.zip` 可分发安装。

### 3. 配置扩展

安装后点击扩展设置页（或新标签页右上角齿轮图标），配置：

| 配置项 | 说明 |
|--------|------|
| 服务地址 | 后端 API 地址，如 `http://192.168.1.100:5000`，支持 `tcp://` 前缀 |
| 访问密码 | 与后端 `config.yml` 中 `api_key` 对应 |
| 更新间隔 | 后台同步书签的时间间隔（分钟） |
| 主题 | 暗色 / 亮色 |
| 天气城市 | 如 `北京`、`Shenzhen`，留空不显示 |
| Bing 每日壁纸 | 开关，禁用后使用默认渐变背景 |
| 搜索引擎 | Bing / Google / 百度 |

## 项目结构

```
Bookmarks/
├── app.py              # Flask 主应用（API 路由 + 配置热加载）
├── scheduler.py        # 定时任务调度器
├── parser.py           # 书签 HTML 解析器（层级排序 + 合并）
├── git_sync.py         # Git 同步模块
├── run.py              # 启动入口
├── build_ext.sh        # 浏览器扩展打包脚本
├── requirements.txt    # Python 依赖
├── Dockerfile          # Docker 镜像
├── docker-compose.yml  # Docker 编排
├── config.yml          # 配置文件（不入库）
├── templates/
│   └── index.html      # Web 版前端页面
├── extension/          # 浏览器扩展
│   ├── manifest.json   # Manifest V3 配置
│   ├── newtab.html     # 新标签页
│   ├── newtab.css      # 新标签页样式
│   ├── newtab.js       # 新标签页逻辑
│   ├── options.html    # 设置页
│   ├── options.css     # 设置页样式
│   ├── options.js      # 设置页逻辑
│   ├── background.js   # 后台 Service Worker（定时同步 + 增量更新）
│   └── icons/          # 扩展图标
└── data/               # 数据目录（持久化，不入库）
```

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/bookmarks` | GET | 获取所有书签数据（支持 `?q=keyword` 搜索） |
| `/api/update_time` | GET | 获取后端最后更新时间戳 |
| `/api/recent?device_id=xxx` | GET | 获取设备最近访问记录 |
| `/api/visit` | POST | 记录访问（body: `{title, url, category, device_id}`） |
| `/api/refresh` | POST | 手动触发刷新 |
| `/api/config/reload` | POST | 手动触发配置热加载 |

所有 `/api/*` 接口在配置了 `api_key` 时需要请求头 `X-API-Key` 认证。

## 扩展更新机制

扩展采用增量同步策略：

1. 定时触发（由 `chrome.alarms` 驱动，间隔可配置）
2. 先请求 `/api/update_time` 获取后端数据更新时间
3. 与本地缓存的 `last_update` 比较
4. 仅当远程更新时间晚于本地时，才拉取 `/api/bookmarks` 全量数据
5. 更新后通过 `chrome.runtime.sendMessage` 通知已打开的标签页刷新

## 配置说明

### 后端 config.yml

```yaml
git:
  repo_url: "Git仓库地址"
  local_dir: "本地克隆目录"
  branch: "分支名"
  ssh_key_path: "SSH私钥路径"
  bookmark_files:
    - "书签文件路径（支持多个）"

web:
  host: "监听地址"
  port: "监听端口"
  debug: "调试模式"

schedule:
  enabled: true
  interval_minutes: 30

recent:
  max_count: 20

api_key: ""  # 可选，设置后所有 API 请求需认证
```

## 技术栈

- **后端**：Python + Flask + PyYAML
- **浏览器扩展**：Manifest V3（Service Worker + chrome.alarms + chrome.storage）
- **前端**：原生 HTML/CSS/JavaScript（毛玻璃 + CSS 变量主题）
- **同步**：Git + SSH
- **天气**：Open-Meteo API
- **壁纸**：Bing HPImageArchive API
- **容器化**：Docker + Docker Compose

## 常见问题

### 1. 扩展点击目录没有反应
确保使用的是 Manifest V3 兼容版本，内联 `onclick` 在 MV3 下被 CSP 禁止，需使用事件绑定。

### 2. TCP 地址连接失败（HTTP 501）
浏览器 fetch 不支持 TCP 协议。扩展会自动将 `tcp://` 转为 `http://` 发起请求。若仍返回 501，请检查 FRP 代理类型是否为 `http` 而非 `tcp`。

### 3. 清除浏览器缓存后配置丢失
所有配置（主题、城市、壁纸开关、搜索引擎等）存储在 `chrome.storage.local`，清除浏览器缓存（Cache）不会影响。只有清除「扩展数据」才会重置。

### 4. Git 同步失败
- 检查 SSH 密钥权限（应为 600）
- 确认 SSH 密钥已添加到 Git 仓库的 deploy keys
- 检查网络连接和仓库地址

## 许可证

MIT License
