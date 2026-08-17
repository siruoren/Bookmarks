# SeeTab

基于 Git 同步的个人书签导航系统，包含后端 API 服务、Web 前端页面和浏览器扩展（兼容 Chrome / Edge / Firefox），实现全平台书签导航。

## 项目简介

本项目由三部分组成：

- **后端服务**（Flask）：从 Git 仓库同步书签文件并解析，提供 RESTful API，支持 XBEL XML、Netscape HTML 和 TXT 格式
- **Web 前端页面**：独立的前端页面，可直接通过浏览器访问后端服务使用
- **浏览器扩展**：覆盖新标签页，从后端获取书签并展示为美观的导航页，支持 Bing 每日壁纸、天气、主题切换等

## 核心特性

### 浏览器扩展

- 覆盖新标签页，替代默认空白页
- 兼容 Chrome / Edge（Manifest V3）和 Firefox（Manifest V2）
- 读取浏览器本地书签，与服务端书签按目录名智能合并（同名目录合并条目，按 URL 去重）
- 目录展开和搜索结果中，书签名显示为「目录名 - 书签名」，方便定位条目所属目录
- Bing 每日壁纸背景（可在设置中开关）
- 暗色/亮色主题切换
- 天气显示（可配置城市，基于 Open-Meteo API）
- 实时时钟 + 日期 + 农历 + 节气
- 目录标签式展示，点击展开书签
- 多关键词搜索：空格分隔多个关键词，AND 逻辑全部匹配（支持拼音全拼和首字母）
- 搜索结果分类展示：目录名匹配的显示为目录卡片，书签名/URL 匹配的显示条目列表
- 搜索引擎搜索（支持 Bing / Google / 百度，可配置）
- Favicon 懒加载（IntersectionObserver）
- 毛玻璃风格卡片 UI
- 后台定时增量同步（先检查更新时间，有更新才拉取）
- 所有配置存储在 chrome.storage，清除浏览器缓存不影响设置
- 最近使用记录（长按可进入晃动删除模式）
- Firefox 扩展通过 background 代理 fetch 请求，绕过 MV3 CSP 限制

### Web 前端页面

- 独立可访问的 Web 版导航页
- 与浏览器扩展功能一致：目录展示、搜索、最近使用、天气、主题切换、壁纸
- 最近使用记录按设备 ID 隔离存储在后端
- 无需安装扩展即可使用

### 后端服务

- Floccus 浏览器插件同步书签到 Git 仓库
- 定时任务自动拉取最新书签
- 智能变更检测：仅在书签文件修改时间变化时才重新解析
- 多格式书签解析：XBEL XML、Netscape HTML、TXT（纯文本）
- TXT 书签文件：仓库 `bookmarks/` 目录下的 `.txt` 文件自动解析，文件名为目录名，与 XML 同名目录自动合并条目
- API Key 认证保护
- CORS 支持（浏览器插件跨域请求）
- 配置热加载，修改 config.yml 后自动生效无需重启
- 最近访问记录（按设备 ID 隔离，持久化到文件）

## 快速开始

### 1. 部署后端服务

#### Docker 部署（推荐）

```bash
git clone <your-repo-url>
cd seetab
```

创建配置文件 `config.yml`：

```yaml
git:
  repo_url: "git@github.com:yourusername/bookmarks.git"
  local_dir: "./data/repo"
  branch: "master"
  ssh_key_path: "/root/.ssh/id_rsa"
  bookmark_files:
    - "bookmarks.xbel"

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

#### Chrome / Edge 开发者模式加载

1. 打开浏览器扩展管理页：
   - Chrome：`chrome://extensions/`
   - Edge：`edge://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目中的 `extension` 目录

#### Firefox 临时加载

1. 地址栏输入 `about:debugging#/runtime/this-firefox`
2. 点击「临时载入附加组件」
3. 选择 `extension/manifest-firefox.json` 文件

> **注意**：临时加载的扩展重启 Firefox 后需重新加载。如需永久安装，请使用 `web-ext sign` 签名（见下方 Firefox 签名安装章节）。

#### 打包安装

```bash
./build_ext.sh
```

脚本自动从当前 git 分支名提取版本号（如分支 `v1.2.0` → 版本 `1.2.0`），并写入 manifest。`main`/`master` 分支使用 manifest 中已有版本号。

生成文件：
- `dist/seetab-chrome-vX.X.X.zip` — Chrome / Edge 安装包
- `dist/seetab-firefox-vX.X.X.zip` — Firefox 安装包

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

## 书签数据来源

### 多格式支持

后端支持三种书签文件格式，均由 `parser.py` 统一解析：

| 格式 | 来源 | 说明 |
|------|------|------|
| XBEL XML | Floccus 插件导出 | 支持 ` / ` 分隔的多级目录路径，自动补齐缺失的父级目录 |
| Netscape HTML | 浏览器导出 | 兼容 `<DT><A>` 格式，HREF 属性位置不限 |
| TXT | 手动维护 | 仓库 `bookmarks/` 目录下的 `.txt` 文件 |

### TXT 书签文件

在 Git 仓库的 `bookmarks/` 目录下放置 `.txt` 文件，后端会自动解析并合并到书签数据中。

**文件格式**：
- **文件名**（去 `.txt` 扩展名）作为目录名
- **`#` 开头的行**为注释，被忽略
- **非 `#` 开头的行**为书签条目：以空格分隔，最后一位为 URL，前面的部分为书签名（空格以 `_` 替换）

**示例** — 文件 `bookmarks/开发工具.txt`：

```
# 这是注释，被忽略
GitHub https://github.com
Stack_Overflow https://stackoverflow.com
VS_Code_在线版 https://vscode.dev
```

解析结果：
- 目录名：`开发工具`
- 书签：`GitHub` → `https://github.com`，`Stack_Overflow` → `https://stackoverflow.com`，`VS_Code_在线版` → `https://vscode.dev`

### XBEL/HTML 转 TXT

使用 `xbel_to_txt.py` 可将 XBEL 或 HTML 书签文件按目录拆分为独立的 TXT 文件：

```bash
python3 xbel_to_txt.py data/repo/bookmarks.xbel data/repo/bookmarks
python3 xbel_to_txt.py data/repo/bookmarks.html data/repo/bookmarks
```

### 同名目录合并

如果不同来源（XML / HTML / TXT）中存在同名目录（如 `开发工具`），书签条目会自动合并到该目录下，不会重复创建。

## 本地书签与远程书签合并

浏览器扩展会读取本地书签，与后端返回的远程书签按**显示的目录名**（短名）合并：

- 同短名的目录合并为一个，条目按 URL 去重
- 例如：远程目录 `"书签栏 / 开发工具"` 与本地目录 `"开发工具"` 会合并（短名均为 `开发工具`）
- 不同短名的目录分别展示

## 搜索功能

搜索支持**多关键词模糊匹配**，在扩展、Web 前端和后端 API 中行为一致：

- **多关键词**：输入空格分隔的多个关键词，如 `github 开发`
- **AND 逻辑**：所有关键词必须全部匹配才算命中
- **匹配范围**：书签标题（含拼音全拼和首字母）、URL、目录名
- **拼音支持**：扩展端使用前端拼音库，后端 API 使用 pypinyin

示例：
| 输入 | 匹配逻辑 |
|------|---------|
| `github` | 标题或 URL 包含 `github`（含拼音） |
| `github 开发` | 标题或 URL 同时包含 `github` 和 `开发` |
| `kf` | 标题拼音首字母包含 `kf`（如 `开发` → `kf`） |

## 书签显示优化

为方便在搜索结果和目录展开时快速定位条目所属目录，书签标题采用 **「目录名 - 书签名」** 格式显示：

- **目录展开面板**：书签名显示为 `开发工具 - GitHub`
- **搜索结果列表**：匹配的书签名同样显示为 `开发工具 - GitHub`
- **搜索结果中的目录卡片**：可点击展开查看目录全部书签

## Firefox 签名安装

Firefox 正式版要求扩展经过 Mozilla 签名验证。步骤：

1. 安装 Node.js 和 web-ext：
   ```bash
   npm install --global web-ext
   ```

2. 注册 Mozilla 开发者账号：https://addons.mozilla.org/developers/

3. 在「API Credentials」页面生成 API Key 和 API Secret

4. 准备 Firefox 扩展目录：
   ```bash
   mkdir firefox-ext
   cp extension/* firefox-ext/ -r
   cp extension/manifest-firefox.json firefox-ext/manifest.json
   ```

5. 签名：
   ```bash
   web-ext sign --source-dir firefox-ext --api-key=YOUR_KEY --api-secret=YOUR_SECRET
   ```

6. 签名后的 `.xpi` 文件在 `web-ext-artifacts/` 目录，拖入 `about:addons` 即可永久安装

## 项目结构

```
seetab/
├── app.py                    # Flask 主应用（API 路由 + CORS + 配置热加载 + 最近访问）
├── scheduler.py              # 定时任务调度器
├── parser.py                 # 书签解析器（XBEL XML + Netscape HTML + TXT + 拼音搜索）
├── git_sync.py               # Git 同步模块（clone/pull + SSH 密钥注入）
├── run.py                    # 启动入口
├── xbel_to_txt.py            # XBEL/HTML 书签按目录拆分为 TXT 文件
├── build_ext.sh              # 浏览器扩展打包脚本（分支名作为版本号，自动更新 manifest）
├── build_img.sh              # Docker 镜像构建脚本
├── requirements.txt          # Python 依赖
├── Dockerfile                # Docker 镜像（python:3.11-slim + git + ssh）
├── docker-compose.yml        # Docker 编排（端口 5005:80）
├── config.yml                # 配置文件（不入库）
├── templates/
│   └── index.html            # Web 版前端页面（内联 CSS + JS）
├── extension/                # 浏览器扩展
│   ├── manifest.json         # Chrome/Edge Manifest V3 配置
│   ├── manifest-firefox.json # Firefox Manifest V2 配置
│   ├── newtab.html           # 新标签页 HTML
│   ├── newtab.css            # 新标签页样式（毛玻璃 + 亮暗主题 + 响应式）
│   ├── newtab.js             # 新标签页逻辑（搜索 + 本地书签 + 合并 + 目录展开 + 拼音）
│   ├── options.html          # 设置页 HTML
│   ├── options.css           # 设置页样式
│   ├── options.js            # 设置页逻辑（连接测试 + 同步触发 + proxyFetch 代理）
│   ├── background.js         # 后台脚本（定时增量同步 + proxyFetch 处理 + 消息监听）
│   ├── background-firefox.js # Firefox 专用后台脚本（新标签页/主页接管）
│   ├── pinyin.js             # 拼音搜索库（前端版）
│   └── icons/                # 扩展图标（16/48/128）
└── data/                     # 数据目录（持久化，不入库）
    ├── repo/                 # Git 仓库克隆目录
    └── recent/               # 最近访问记录（按设备 ID 分文件存储）
```

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/bookmarks` | GET | 获取所有书签数据（支持 `?q=keyword` 搜索，空格分隔多关键词 AND 匹配，含拼音） |
| `/api/update_time` | GET | 获取后端最后更新时间戳（用于增量同步判断） |
| `/api/recent?device_id=xxx` | GET | 获取设备最近访问记录 |
| `/api/visit` | POST | 记录访问（body: `{title, url, category, device_id}`） |
| `/api/recent/delete` | POST | 删除最近访问项（body: `{url, device_id}`） |
| `/api/refresh` | POST | 手动触发书签刷新（重新 git pull + 解析） |
| `/api/config/reload` | POST | 手动触发配置热加载 |

所有 `/api/*` 接口：
- 配置了 `api_key` 时需要请求头 `X-API-Key` 认证
- 支持 CORS 跨域请求（浏览器扩展需要）
- 支持 OPTIONS 预检请求（Firefox 需要）

## 扩展更新机制

扩展采用增量同步策略：

1. 定时触发（由 `chrome.alarms` 驱动，间隔可配置，默认 5 分钟）
2. 先请求 `/api/update_time` 获取后端数据更新时间
3. 与本地缓存的 `last_update` 比较
4. 仅当远程更新时间晚于本地时，才拉取 `/api/bookmarks` 全量数据
5. 更新后通过 `chrome.runtime.sendMessage` 通知已打开的标签页刷新
6. 支持手动触发强制全量同步（设置页点击「立即同步」）

### Firefox 网络请求机制

Firefox MV3 对扩展的 CSP 限制导致扩展页面无法直接 fetch HTTP 资源。解决方案：

- Firefox 扩展使用 **Manifest V2**，无 CSP 限制
- 扩展页面通过 `proxyFetch`（`chrome.runtime.sendMessage`）请求 background 代理
- Background 使用 `httpGet` 函数发请求，返回结果给扩展页面
- 同时接管 Firefox 新标签页和主页（`background-firefox.js`）
- 每次打包 Firefox 扩展自动生成随机 gecko ID，避免 ID 冲突

## 配置说明

### 后端 config.yml

```yaml
git:
  repo_url: "Git仓库地址"
  local_dir: "本地克隆目录"
  branch: "分支名"
  ssh_key_path: "SSH私钥路径"
  bookmark_files:
    - "书签文件路径（支持多个，.xbel / .html）"
  # 仓库 bookmarks/ 目录下的 .txt 文件自动解析

web:
  host: "监听地址"    # 默认 0.0.0.0
  port: "监听端口"    # 默认 5000
  debug: "调试模式"   # 默认 false

schedule:
  enabled: true
  interval_minutes: 30

recent:
  max_count: 20

api_key: ""  # 可选，设置后所有 API 请求需认证
```

### 配置热加载

修改 `config.yml` 后无需重启服务：
- 定时任务每次执行前自动检测配置文件修改时间
- 检测到变更后自动重新加载配置、重建 Git 同步和调度器
- 也可通过 `POST /api/config/reload` 手动触发

## 技术栈

- **后端**：Python 3.11 + Flask + PyYAML + pypinyin
- **浏览器扩展**：Chrome Manifest V3 / Firefox Manifest V2
- **前端**：原生 HTML/CSS/JavaScript（毛玻璃 + CSS 变量主题 + IntersectionObserver）
- **同步**：Git + SSH
- **天气**：Open-Meteo API（geocoding + forecast）
- **壁纸**：Bing HPImageArchive API
- **容器化**：Docker (python:3.11-slim) + Docker Compose

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

### 5. Firefox 插件提示"未验证，无法安装"
Firefox 正式版要求扩展签名。解决方案：
- **临时加载**：`about:debugging` → 临时载入附加组件（重启后需重新加载）
- **签名安装**：使用 `web-ext sign` 签名后永久安装（见上方 Firefox 签名安装章节）

### 6. Firefox 插件网络错误（NetworkError）
- 确保后端服务已启动且地址可访问
- 确保使用 MV2 版 manifest（`manifest-firefox.json`）
- 扩展页面通过 background 代理请求，无需直接 fetch

### 7. Firefox 新标签页/主页未被替换
- 临时加载的扩展可能无法接管，建议签名安装
- `background-firefox.js` 会通过 tabs 事件监听尝试重定向
- 也可在 Firefox 设置中将主页设为 `about:newtab`

### 8. TXT 书签未解析
- 确认 txt 文件放在仓库的 `bookmarks/` 目录下
- 确认文件扩展名为 `.txt`
- `#` 开头的行为注释，其余行才会被解析
- 查看后端日志确认扫描路径和发现文件数

### 9. 本地书签与远程书签未合并
- 合并按目录的**短名**（路径最后一段）匹配
- 例如远程 `"书签栏 / 开发工具"` 与本地 `"开发工具"` 会合并
- 相同 URL 的条目会自动去重

### 10. 搜索结果中书签看不到所属目录
- 搜索结果和目录展开的书签名已优化为「目录名 - 书签名」格式显示
- 方便快速定位条目所在目录

### 11. 多关键词搜索
- 输入空格分隔的多个关键词，所有关键词必须全部匹配（AND 逻辑）
- 如 `github 开发` 匹配同时包含 `github` 和 `开发` 的书签
- 支持拼音匹配：`kf` 可匹配 `开发`（首字母），`kaifa` 可匹配 `开发`（全拼）

## 许可证

MIT License
