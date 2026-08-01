// 全局状态
let allCategories = [];
let activeCat = null;   // 当前展开的目录名
let isSearchMode = false;

// 分类图标
const CAT_ICONS = ['📂','🎬','📝','💻','🎮','🎧','🔧','🏠','📚','💰','🛒','✈️','🖼️','👔','🔗','🌍','📊','🗂️','⚙️','🧰','📁','🔔','📌','🎯'];
function catIcon(i) { return CAT_ICONS[i % CAT_ICONS.length]; }

// === 时钟 ===
function updateClock() {
  const now = new Date();
  const h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('clock').textContent = `${h}:${m}`;

  const dateStr = now.toLocaleDateString('zh-CN', {year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'});
  document.getElementById('date').textContent = dateStr;

  let greeting = '晚上好';
  if (h >= 5 && h < 12) greeting = '早上好';
  else if (h >= 12 && h < 14) greeting = '中午好';
  else if (h >= 14 && h < 18) greeting = '下午好';
  document.getElementById('greeting').textContent = greeting;
}

// === 日历 ===
function updateCalendar() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekday = now.toLocaleDateString('zh-CN', {weekday: 'short'});
  const lunar = getLunarInfo(now);

  document.getElementById('calendar').innerHTML =
    `<span class="cal-date">${month}/${day}</span>` +
    `<span class="cal-weekday">${weekday}</span>` +
    `<span class="cal-lunar">${lunar}</span>`;
}

function getLunarInfo(date) {
  const lunarDays = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
    '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
    '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
  const terms = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满',
    '芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降',
    '立冬','小雪','大雪','冬至'];

  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  const termIdx = m * 2 + (d > 15 ? 1 : 0);
  if (termIdx < terms.length) {
    const termDates = [6,20,4,19,6,21,5,20,6,21,6,22,7,23,7,23,8,23,8,23,7,22,7,22];
    if (Math.abs(d - termDates[termIdx]) <= 1) return terms[termIdx];
  }
  const dayOfYear = Math.floor((date - new Date(y, 0, 0)) / 86400000);
  return lunarDays[(dayOfYear + 15) % 30] || '';
}

// === 主题 ===
function initTheme() {
  const saved = localStorage.getItem('ext_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ext_theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  document.getElementById('themeIcon').textContent = theme === 'dark' ? '🌙' : '☀️';
}

// === 天气 ===
const weatherIcons = {
  '晴': '☀️', '多云': '⛅', '阴': '☁️', '雨': '🌧️',
  '雪': '❄️', '雾': '🌫️', '雷阵雨': '⛈️', '小雨': '🌦️', '大风': '💨'
};

function getWeatherIcon(desc) {
  for (const key in weatherIcons) if (desc.includes(key)) return weatherIcons[key];
  return '🌤️';
}

function getWeatherDesc(code) {
  const codes = {0:'晴',1:'晴',2:'多云',3:'多云',45:'雾',48:'雾',51:'小雨',53:'小雨',55:'小雨',61:'雨',63:'雨',65:'雨',71:'雪',73:'雪',75:'雪',80:'阵雨',81:'阵雨',82:'阵雨',95:'雷阵雨',96:'雷阵雨',99:'雷阵雨'};
  return codes[code] || '晴';
}

async function fetchWeather(city) {
  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`);
    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) return null;
    const {latitude, longitude, name} = geoData.results[0];
    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
    const wd = await weatherRes.json();
    return { city: name, temp: Math.round(wd.current_weather.temperature), weatherCode: wd.current_weather.weathercode };
  } catch (e) { console.error('获取天气失败:', e); return null; }
}

function updateWeatherDisplay(data) {
  if (!data) return;
  const desc = getWeatherDesc(data.weatherCode);
  document.getElementById('weatherIcon').textContent = getWeatherIcon(desc);
  document.getElementById('weatherTemp').textContent = `${data.temp}°`;
  document.getElementById('weatherCity').textContent = data.city;
}

async function initWeather() {
  const city = localStorage.getItem('ext_weather_city') || '';
  if (city) {
    const data = await fetchWeather(city);
    if (data) updateWeatherDisplay(data);
  }
}

function toggleCityInput() {
  const input = document.getElementById('weatherCityInput');
  if (input.classList.contains('show')) {
    input.classList.remove('show');
  } else {
    input.classList.add('show');
    input.value = localStorage.getItem('ext_weather_city') || '';
    input.focus();
  }
}

function handleCityInput(event) {
  if (event.key === 'Enter') {
    const city = event.target.value.trim();
    if (city) {
      localStorage.setItem('ext_weather_city', city);
      event.target.classList.remove('show');
      fetchWeather(city).then(data => { if (data) updateWeatherDisplay(data); });
    }
  }
}

// === 工具函数 ===
function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escAttr(s) { return escHtml(s); }
function escJs(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"'); }

function cleanTitle(title) {
  if (!title) return '';
  let t = title;
  t = t.replace(/\s*[-_|–—]\s*(CSDN博客|博客园|简书|知乎|Stack Overflow|GitHub|Gitee|GitLab|Jenkins|Docker|Kubernetes|官方|官网|首页|Download|Documentation|Sign In|Login).*$/gi, '');
  t = t.replace(/\s*[-_|–—]\s*$/, '');
  t = t.trim();
  if (t.length > 50) t = t.substring(0, 47) + '...';
  return t || title;
}

function bmIconHtml(url, title) {
  try {
    const u = new URL(url);
    const fav = u.origin + '/favicon.ico';
    const letter = (title || u.hostname)[0].toUpperCase();
    return `<div class="bm-icon" data-fav="${escAttr(fav)}" data-letter="${escAttr(letter)}">${letter}</div>`;
  } catch { return '<div class="bm-icon">?</div>'; }
}

function loadFavicons() {
  document.querySelectorAll('.bm-icon[data-fav]').forEach(el => {
    const fav = el.dataset.fav;
    const img = new Image();
    img.onload = () => { el.innerHTML = ''; const i = document.createElement('img'); i.src = fav; el.appendChild(i); };
    img.onerror = () => {};
    img.src = fav;
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// === 数据加载 ===
function loadFromCache() {
  return new Promise(resolve => {
    chrome.storage.local.get(['bookmarksCache'], result => resolve(result.bookmarksCache || null));
  });
}

function saveToCache(data) { chrome.storage.local.set({ bookmarksCache: data }); }

async function fetchFromBackend() {
  const config = await new Promise(resolve => chrome.storage.local.get(['serverUrl', 'apiPassword'], resolve));
  if (!config.serverUrl) return null;

  // 自动转换 tcp:// → http://，补全协议
  let serverUrl = config.serverUrl.replace(/^tcp:\/\//i, 'http://');
  if (!/^https?:\/\//i.test(serverUrl)) {
    serverUrl = 'http://' + serverUrl;
  }

  const headers = {};
  if (config.apiPassword) headers['X-API-Key'] = config.apiPassword;
  try {
    const resp = await fetch(`${serverUrl}/api/bookmarks`, { headers });
    if (resp.ok) {
      const data = await resp.json();
      data._fetchTime = Date.now();
      saveToCache(data);
      return data;
    }
  } catch (e) { console.error('从后端获取数据失败:', e); }
  return null;
}

async function loadData() {
  const cached = await loadFromCache();
  if (cached) renderData(cached);
  const fresh = await fetchFromBackend();
  if (fresh) {
    renderData(fresh);
  } else if (!cached) {
    document.getElementById('content').innerHTML = '<div class="empty">未配置后端地址或无法连接<br><small>请点击右上角设置按钮进行配置</small></div>';
  }
}

// === 目录信息 ===
function getCategories() {
  return allCategories.filter(c => c.category !== '__root_bookmarks__');
}

// === 渲染 ===
function renderData(data) {
  allCategories = data.categories || [];
  const total = data.total || 0;
  const updateTime = data.last_update ? new Date(data.last_update * 1000).toLocaleString('zh-CN') : '';
  if (updateTime) document.getElementById('updateInfo').textContent = `${total} 书签 | ${updateTime}`;
  if (isSearchMode) return;
  renderMainView();
}

function renderMainView() {
  const content = document.getElementById('content');
  const categories = getCategories();

  let html = '';

  // 目录卡片网格 - 显示所有分类
  html += '<div class="category-grid">';
  categories.forEach((cat, i) => {
    const shortName = cat.category.split(' / ').pop();
    const isActive = activeCat === cat.category;
    const count = cat.items.length;

    html += `<div class="cat-card ${isActive ? 'active' : ''}" onclick="toggleCategory('${escJs(cat.category)}')">
      <div class="cat-icon ico-${i % 8}">${catIcon(i)}</div>
      <div class="cat-name">${escHtml(shortName)}</div>
      <div class="cat-count">${count > 0 ? count + ' 书签' : ''}</div>
    </div>`;
  });
  html += '</div>';

  // 书签展开面板
  if (activeCat) {
    html += renderBookmarkPanel(activeCat);
  }

  content.innerHTML = html;
  loadFavicons();
}

function renderBookmarkPanel(categoryName) {
  const categories = getCategories();
  const cat = categories.find(c => c.category === categoryName);
  const idx = categories.findIndex(c => c.category === categoryName);

  if (!cat || cat.items.length === 0) {
    return '<div class="bookmark-panel"><div class="empty">该目录下没有书签</div></div>';
  }

  let html = '<div class="bookmark-panel">';

  // 面板标题
  const shortName = categoryName.split(' / ').pop();
  const parentPath = categoryName.includes(' / ') ? categoryName.substring(0, categoryName.lastIndexOf(' / ')) : '';
  html += '<div class="bookmark-panel-header">';
  html += `<span class="panel-icon ico-${idx >= 0 ? idx % 8 : 0}">${catIcon(idx >= 0 ? idx : 0)}</span>`;
  html += `<span class="panel-title">${escHtml(shortName)}</span>`;
  if (parentPath) html += `<span class="panel-path">${escHtml(parentPath)}</span>`;
  html += `<span class="panel-count">${cat.items.length} 个书签</span>`;
  html += '<div class="panel-close" onclick="closePanel()">✕</div>';
  html += '</div>';

  // 书签列表
  html += '<div class="bookmark-grid">';
  cat.items.forEach(item => {
    const t = escHtml(cleanTitle(item.title));
    const u = escHtml(item.url);
    html += `<a class="bookmark-item" href="${escAttr(item.url)}" target="_blank" rel="noopener">
      ${bmIconHtml(item.url, item.title)}
      <div class="bm-info"><div class="bm-title">${t}</div><div class="bm-url">${u}</div></div>
    </a>`;
  });
  html += '</div>';

  html += '</div>';
  return html;
}

// === 交互 ===
function toggleCategory(name) {
  activeCat = (activeCat === name) ? null : name;
  isSearchMode = false;
  renderMainView();
}

function closePanel() {
  activeCat = null;
  renderMainView();
}

// === 搜索 ===
function setupSearch() {
  const input = document.getElementById('searchInput');
  let timer = null;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const v = input.value.trim();
    if (!v) { isSearchMode = false; renderMainView(); return; }
    timer = setTimeout(() => { isSearchMode = true; activeCat = null; performSearch(v); }, 200);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = input.value.trim();
      if (v && (v.startsWith('http') || v.includes('.'))) {
        window.location.href = v.startsWith('http') ? v : 'https://' + v;
      }
    }
  });
}

function performSearch(keyword) {
  keyword = keyword.toLowerCase();
  const categories = getCategories();
  const content = document.getElementById('content');

  let html = '', found = false;
  categories.forEach(cat => {
    const matched = cat.items.filter(item =>
      item.title.toLowerCase().includes(keyword) || item.url.toLowerCase().includes(keyword)
    );
    if (matched.length > 0) {
      found = true;
      html += `<div class="search-category">${escHtml(cat.category)}</div>`;
      html += '<div class="bookmark-grid">';
      matched.forEach(item => {
        const t = escHtml(cleanTitle(item.title));
        const u = escHtml(item.url);
        html += `<a class="bookmark-item" href="${escAttr(item.url)}" target="_blank" rel="noopener">
          ${bmIconHtml(item.url, item.title)}
          <div class="bm-info"><div class="bm-title">${t}</div><div class="bm-url">${u}</div></div>
        </a>`;
      });
      html += '</div>';
    }
  });
  if (!found) html += '<div class="empty">未找到匹配的书签</div>';
  content.innerHTML = html;
  loadFavicons();
}

// === 后台更新监听 ===
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'bookmarksUpdated') {
    allCategories = msg.data.categories || [];
    if (isSearchMode) return;
    renderMainView();
    const total = msg.data.total || 0;
    const updateTime = msg.data.last_update ? new Date(msg.data.last_update * 1000).toLocaleString('zh-CN') : '';
    if (updateTime) document.getElementById('updateInfo').textContent = `${total} 书签 | ${updateTime}`;
  }
});

// === 设置按钮 ===
document.getElementById('settingsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// === 初始化 ===
initTheme();
updateClock();
updateCalendar();
setInterval(updateClock, 10000);
setInterval(updateCalendar, 60000);
setupSearch();
loadData();
initWeather();

setTimeout(() => document.getElementById('searchInput').focus(), 100);
