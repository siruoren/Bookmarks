// 设置页面逻辑

const DEFAULTS = {
  serverUrl: '',
  apiPassword: '',
  updateInterval: 5,
  enableWallpaper: true,
  searchEngine: 'bing',
  theme: 'dark',
  weatherCity: ''
};

// 内部请求时将协议转为浏览器 fetch 支持的 http/https
// 用户侧始终保留原始输入（如 tcp://）
function toFetchUrl(url) {
  let u = url.replace(/^tcp:\/\//i, 'http://');
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u;
}

// 验证地址格式是否合法（支持 tcp/http/https/无协议）
function isValidUrl(url) {
  const httpUrl = toFetchUrl(url);
  try { new URL(httpUrl); return true; } catch { return false; }
}

// 加载配置
function loadConfig() {
  chrome.storage.local.get(DEFAULTS, config => {
    document.getElementById('serverUrl').value = config.serverUrl;
    document.getElementById('apiPassword').value = config.apiPassword;
    document.getElementById('updateInterval').value = config.updateInterval;
    document.getElementById('enableWallpaper').checked = config.enableWallpaper;
    document.getElementById('searchEngine').value = config.searchEngine;
    document.getElementById('theme').value = config.theme;
    document.getElementById('weatherCity').value = config.weatherCity;
    updateStatus();
  });
}

// 保存配置
function saveConfig() {
  const serverUrl = document.getElementById('serverUrl').value.trim().replace(/\/+$/, '');
  const apiPassword = document.getElementById('apiPassword').value;
  const updateInterval = parseInt(document.getElementById('updateInterval').value) || 5;
  const enableWallpaper = document.getElementById('enableWallpaper').checked;
  const searchEngine = document.getElementById('searchEngine').value;
  const theme = document.getElementById('theme').value;
  const weatherCity = document.getElementById('weatherCity').value.trim();

  if (!serverUrl) {
    showStatus('请输入服务地址', 'error');
    return;
  }

  if (!isValidUrl(serverUrl)) {
    showStatus('服务地址格式不正确', 'error');
    return;
  }

  if (updateInterval < 1 || updateInterval > 1440) {
    showStatus('更新间隔需在 1-1440 分钟之间', 'error');
    return;
  }

  // 保存原始输入，不做转换
  chrome.storage.local.set({ serverUrl, apiPassword, updateInterval, enableWallpaper, searchEngine, theme, weatherCity }, () => {
    showStatus('配置已保存', 'success');
    updateStatus();
  });
}

// 测试连接
async function testConnection() {
  const serverUrl = document.getElementById('serverUrl').value.trim().replace(/\/+$/, '');
  const apiPassword = document.getElementById('apiPassword').value;

  if (!serverUrl) {
    showStatus('请先输入服务地址', 'error');
    return;
  }

  const fetchUrl = toFetchUrl(serverUrl);

  showStatus('正在测试连接...', '');
  const statusEl = document.getElementById('status');
  statusEl.className = 'status';

  const headers = {};
  if (apiPassword) {
    headers['X-API-Key'] = apiPassword;
  }

  try {
    // 先测试轻量接口
    const resp = await fetch(`${fetchUrl}/api/update_time`, {
      headers,
      signal: AbortSignal.timeout(8000)
    });

    if (resp.ok) {
      // 再获取书签数量
      const bmResp = await fetch(`${fetchUrl}/api/bookmarks`, {
        headers,
        signal: AbortSignal.timeout(15000)
      });
      if (bmResp.ok) {
        const data = await bmResp.json();
        showStatus(`连接成功! 共 ${data.total || 0} 个书签`, 'success');
      } else if (bmResp.status === 401) {
        showStatus('认证失败: 密码不正确', 'error');
      } else {
        showStatus(`连接成功（服务器可达），但获取书签失败: HTTP ${bmResp.status}`, 'error');
      }
    } else if (resp.status === 401) {
      showStatus('认证失败: 密码不正确', 'error');
    } else if (resp.status === 501) {
      showStatus('服务器返回 501：请确认后端服务运行正常，且 FRP 代理类型为 http 而非 tcp', 'error');
    } else {
      showStatus(`连接失败: HTTP ${resp.status}`, 'error');
    }
  } catch (e) {
    if (e.name === 'TimeoutError') {
      showStatus('连接超时，请检查地址是否正确、服务是否运行', 'error');
    } else if (e.message && e.message.includes('Failed to fetch')) {
      showStatus('网络错误：请检查地址是否可达，若使用 FRP 隧道请确认代理类型为 http', 'error');
    } else {
      showStatus(`连接失败: ${e.message}`, 'error');
    }
  }
}

// 立即同步
function triggerSync() {
  chrome.runtime.sendMessage({ type: 'triggerSync' }, resp => {
    if (resp && resp.ok) {
      showStatus('同步已触发', 'success');
      setTimeout(updateStatus, 1000);
    } else {
      showStatus('同步请求失败', 'error');
    }
  });
}

// 更新状态显示
function updateStatus() {
  chrome.runtime.sendMessage({ type: 'getStatus' }, status => {
    if (!status) return;

    const configEl = document.getElementById('statusConfig');
    const totalEl = document.getElementById('statusTotal');
    const fetchEl = document.getElementById('statusLastFetch');

    configEl.textContent = status.configured ? '已配置' : '未配置';
    configEl.style.color = status.configured ? '#2ecc71' : '#e74c3c';

    totalEl.textContent = status.total > 0 ? `${status.total} 个` : '-';

    if (status.lastFetch > 0) {
      const d = new Date(status.lastFetch);
      fetchEl.textContent = d.toLocaleString('zh-CN');
    } else {
      fetchEl.textContent = '从未同步';
    }
  });
}

// 显示状态消息
function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `status ${type}`;
}

// 切换密码可见
document.getElementById('togglePwd').addEventListener('click', () => {
  const input = document.getElementById('apiPassword');
  const btn = document.getElementById('togglePwd');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🔒';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
});

// 绑定按钮事件
document.getElementById('saveBtn').addEventListener('click', saveConfig);
document.getElementById('testBtn').addEventListener('click', testConnection);
document.getElementById('syncBtn').addEventListener('click', triggerSync);

// 初始化
loadConfig();
