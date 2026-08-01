// 后台服务 Worker - 定时从后端获取书签更新并缓存

const ALARM_NAME = 'bookmarks-sync';
const DEFAULT_INTERVAL_MIN = 5;

// 安装/启动时初始化
chrome.runtime.onInstalled.addListener(() => {
  initAlarm();
  // 首次安装立即同步一次
  syncBookmarks();
});

chrome.runtime.onStartup.addListener(() => {
  initAlarm();
  // 启动时同步一次
  syncBookmarks();
});

// 定时触发
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) {
    syncBookmarks();
  }
});

// 初始化/更新定时器
async function initAlarm() {
  const config = await getConfig();
  const interval = config.updateInterval || DEFAULT_INTERVAL_MIN;

  // 清除旧定时器
  await chrome.alarms.clear(ALARM_NAME);

  // 设置新定时器（最少1分钟）
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: Math.max(1, interval),
    periodInMinutes: Math.max(1, interval)
  });

  console.log(`[Bookmarks] 定时同步已设置: 每 ${interval} 分钟`);
}

// 获取配置
function getConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get({
      serverUrl: '',
      apiPassword: '',
      updateInterval: DEFAULT_INTERVAL_MIN
    }, resolve);
  });
}

// 同步书签数据（增量：先检查后端更新时间）
async function syncBookmarks() {
  const config = await getConfig();

  if (!config.serverUrl) {
    console.log('[Bookmarks] 未配置后端地址，跳过同步');
    return;
  }

  // 自动转换 tcp:// → http://，补全协议
  let serverUrl = config.serverUrl.replace(/^tcp:\/\//i, 'http://');
  if (!/^https?:\/\//i.test(serverUrl)) {
    serverUrl = 'http://' + serverUrl;
  }

  const headers = {};
  if (config.apiPassword) {
    headers['X-API-Key'] = config.apiPassword;
  }

  try {
    // 先获取后端更新时间，与本地缓存比较
    const cached = await new Promise(resolve => {
      chrome.storage.local.get(['bookmarksCache'], result => {
        resolve(result.bookmarksCache || null);
      });
    });
    const localUpdateTime = cached ? (cached.last_update || 0) : 0;

    const timeResp = await fetch(`${serverUrl}/api/update_time`, {
      headers,
      signal: AbortSignal.timeout(8000)
    });

    if (!timeResp.ok) {
      if (timeResp.status === 401) {
        console.error('[Bookmarks] 认证失败: API Key 不正确');
      } else {
        console.error('[Bookmarks] 检查更新时间失败:', timeResp.status);
      }
      return;
    }

    const timeData = await timeResp.json();
    const remoteUpdateTime = timeData.last_update || 0;

    // 本地缓存时间 >= 后端更新时间，无需更新
    if (localUpdateTime > 0 && localUpdateTime >= remoteUpdateTime) {
      console.log(`[Bookmarks] 数据无更新，跳过同步 (本地: ${new Date(localUpdateTime * 1000).toLocaleString('zh-CN')}, 远程: ${new Date(remoteUpdateTime * 1000).toLocaleString('zh-CN')})`);
      return;
    }

    // 需要更新，拉取完整书签数据
    console.log(`[Bookmarks] 检测到更新，正在同步... (本地: ${localUpdateTime > 0 ? new Date(localUpdateTime * 1000).toLocaleString('zh-CN') : '无'}, 远程: ${new Date(remoteUpdateTime * 1000).toLocaleString('zh-CN')})`);

    const resp = await fetch(`${serverUrl}/api/bookmarks`, { headers });

    if (!resp.ok) {
      if (resp.status === 401) {
        console.error('[Bookmarks] 认证失败: API Key 不正确');
      } else {
        console.error('[Bookmarks] 请求失败:', resp.status);
      }
      return;
    }

    const data = await resp.json();
    data._fetchTime = Date.now();

    // 保存到缓存
    chrome.storage.local.set({ bookmarksCache: data });

    // 通知所有打开的新标签页更新数据
    chrome.runtime.sendMessage({
      type: 'bookmarksUpdated',
      data: data
    }).catch(() => {
      // 没有接收者时忽略错误
    });

    const total = data.total || 0;
    const now = new Date().toLocaleString('zh-CN');
    console.log(`[Bookmarks] 同步成功: ${total} 个书签 @ ${now}`);

  } catch (e) {
    console.error('[Bookmarks] 同步失败:', e.message);
  }
}

// 监听配置变更，重新初始化定时器
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.serverUrl || changes.apiPassword || changes.updateInterval)) {
    initAlarm();
    // 配置变更后立即同步一次
    syncBookmarks();
  }
});

// 监听来自新标签页或设置页的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'triggerSync') {
    syncBookmarks().then(() => sendResponse({ ok: true }));
    return true; // 保持消息通道
  }

  if (msg.type === 'getStatus') {
    getConfig().then(config => {
      chrome.storage.local.get(['bookmarksCache'], result => {
        const cache = result.bookmarksCache;
        sendResponse({
          configured: !!config.serverUrl,
          lastFetch: cache?._fetchTime || 0,
          total: cache?.total || 0
        });
      });
    });
    return true;
  }
});
