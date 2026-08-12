// 后台服务 Worker - 定时从后端获取书签更新并缓存

const ALARM_NAME = 'bookmarks-sync';
const DEFAULT_INTERVAL_MIN = 5;

// 协议转换：tcp:// → http://，补全协议
function toFetchUrl(url) {
  let u = url.replace(/^tcp:\/\//i, 'http://');
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u;
}

// 安装/启动时初始化
chrome.runtime.onInstalled.addListener(() => { initAlarm(); syncBookmarks(); });
chrome.runtime.onStartup.addListener(() => { initAlarm(); syncBookmarks(); });

// 定时触发
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) syncBookmarks();
});

// 初始化/更新定时器
async function initAlarm() {
  const config = await getConfig();
  const interval = Math.max(1, config.updateInterval || DEFAULT_INTERVAL_MIN);
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: interval, periodInMinutes: interval });
  console.log(`[Bookmarks] 定时同步已设置: 每 ${interval} 分钟`);
}

// 获取配置
function getConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get({
      serverUrl: 'http://192.168.31.120:5005',
      apiPassword: '',
      updateInterval: DEFAULT_INTERVAL_MIN
    }, resolve);
  });
}

// 同步书签数据（force=true 时强制全量同步，跳过增量检查）
async function syncBookmarks(force = false) {
  const config = await getConfig();
  if (!config.serverUrl) {
    console.log('[Bookmarks] 未配置后端地址，跳过同步');
    return;
  }

  const serverUrl = toFetchUrl(config.serverUrl);
  const headers = config.apiPassword ? { 'X-API-Key': config.apiPassword } : {};

  try {
    // 非强制同步时做增量检查
    if (!force) {
      const cached = await new Promise(resolve => {
        chrome.storage.local.get(['bookmarksCache'], r => resolve(r.bookmarksCache || null));
      });
      const localUpdateTime = cached?.last_update || 0;

      const timeResp = await fetch(`${serverUrl}/api/update_time`, {
        headers,
        signal: AbortSignal.timeout(8000)
      });

      if (!timeResp.ok) {
        console.error(timeResp.status === 401
          ? '[Bookmarks] 认证失败: API Key 不正确'
          : `[Bookmarks] 检查更新时间失败: ${timeResp.status}`);
        return;
      }

      const remoteUpdateTime = (await timeResp.json()).last_update || 0;

      if (localUpdateTime > 0 && localUpdateTime >= remoteUpdateTime) {
        console.log(`[Bookmarks] 数据无更新，跳过同步`);
        return;
      }
    }

    console.log(`[Bookmarks] ${force ? '强制全量同步' : '增量同步'}中...`);
    const resp = await fetch(`${serverUrl}/api/bookmarks`, { headers });

    if (!resp.ok) {
      console.error(resp.status === 401
        ? '[Bookmarks] 认证失败: API Key 不正确'
        : `[Bookmarks] 请求失败: ${resp.status}`);
      return;
    }

    const data = await resp.json();
    data._fetchTime = Date.now();
    chrome.storage.local.set({ bookmarksCache: data });

    // 通知所有打开的新标签页（Firefox 无接收端时会抛错，需 catch）
    try { chrome.runtime.sendMessage({ type: 'bookmarksUpdated', data }).catch(() => {}); } catch (e) {}

    console.log(`[Bookmarks] 同步成功: ${data.total || 0} 个书签`);

  } catch (e) {
    console.error('[Bookmarks] 同步失败:', e.message);
  }
}

// 监听配置变更
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.serverUrl || changes.apiPassword || changes.updateInterval)) {
    initAlarm();
    syncBookmarks();
  }
});

// 监听消息
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'triggerSync') {
    syncBookmarks(true).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'getStatus') {
    getConfig().then(config => {
      chrome.storage.local.get(['bookmarksCache'], result => {
        const cache = result.bookmarksCache;
        sendResponse({
          configured: !!config.serverUrl,
          lastFetch: cache?._fetchTime || 0,
          lastUpdate: cache?.last_update || 0,
          total: cache?.total || 0
        });
      });
    });
    return true;
  }
});
