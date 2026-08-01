// 全局状态
let allCategories = [];
let _validCategories = null;  // 缓存过滤后的有效目录
let activeCat = null;
let isSearchMode = false;
let isShakeMode = false;  // 最近使用长按晃动模式

// 分类图标
const CAT_ICONS = ['📂','🎬','📝','💻','🎮','🎧','🔧','🏠','📚','💰','🛒','✈️','🖼️','👔','🔗','🌍','📊','🗂️','⚙️','🧰','📁','🔔','📌','🎯'];
const catIcon = i => CAT_ICONS[i % CAT_ICONS.length];

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
async function initTheme() {
  const result = await new Promise(resolve => {
    chrome.storage.local.get({ theme: 'dark' }, resolve);
  });
  document.documentElement.setAttribute('data-theme', result.theme);
  updateThemeIcon(result.theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  chrome.storage.local.set({ theme: next });
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
  const result = await new Promise(resolve => {
    chrome.storage.local.get({ weatherCity: '' }, resolve);
  });
  if (result.weatherCity) {
    const data = await fetchWeather(result.weatherCity);
    if (data) updateWeatherDisplay(data);
  }
}

async function toggleCityInput() {
  const input = document.getElementById('weatherCityInput');
  if (input.classList.contains('show')) {
    input.classList.remove('show');
  } else {
    input.classList.add('show');
    const result = await new Promise(resolve => {
      chrome.storage.local.get({ weatherCity: '' }, resolve);
    });
    input.value = result.weatherCity;
    input.focus();
  }
}

function handleCityInput(event) {
  if (event.key === 'Enter') {
    const city = event.target.value.trim();
    if (city) {
      chrome.storage.local.set({ weatherCity: city });
      event.target.classList.remove('show');
      fetchWeather(city).then(data => { if (data) updateWeatherDisplay(data); });
    }
  }
}

// === 工具函数 ===
function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
const escAttr = escHtml;

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

// Favicon 懒加载（IntersectionObserver）
let _favObserver = null;
function getFavObserver() {
  if (_favObserver) return _favObserver;
  _favObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      _favObserver.unobserve(el);
      const fav = el.dataset.fav;
      if (!fav) return;
      const img = new Image();
      img.onload = () => { el.innerHTML = ''; const i = document.createElement('img'); i.src = fav; el.appendChild(i); };
      img.onerror = () => {};
      img.src = fav;
    });
  }, { rootMargin: '200px' });
  return _favObserver;
}

function loadFavicons() {
  const icons = document.querySelectorAll('.bm-icon[data-fav]');
  if (icons.length === 0) return;
  const observer = getFavObserver();
  icons.forEach(el => observer.observe(el));
}

// === 数据加载 ===
function loadFromCache() {
  return new Promise(resolve => {
    chrome.storage.local.get(['bookmarksCache'], result => resolve(result.bookmarksCache || null));
  });
}

function saveToCache(data) { chrome.storage.local.set({ bookmarksCache: data }); }

function toFetchUrl(url) {
  let u = url.replace(/^tcp:\/\//i, 'http://');
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u;
}

async function fetchFromBackend() {
  const config = await new Promise(resolve => chrome.storage.local.get(['serverUrl', 'apiPassword'], resolve));
  if (!config.serverUrl) return null;

  const serverUrl = toFetchUrl(config.serverUrl);
  const headers = config.apiPassword ? { 'X-API-Key': config.apiPassword } : {};
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

// === 最近使用 ===
async function recordVisit(url, title) {
  if (!url) return;
  const result = await new Promise(resolve => {
    chrome.storage.local.get({ visitCounts: {} }, resolve);
  });
  result.visitCounts[url] = {
    title: title || url,
    lastVisit: Date.now()
  };
  chrome.storage.local.set({ visitCounts: result.visitCounts });
}

async function removeVisited(url) {
  const result = await new Promise(resolve => {
    chrome.storage.local.get({ visitCounts: {} }, resolve);
  });
  delete result.visitCounts[url];
  chrome.storage.local.set({ visitCounts: result.visitCounts });
  refreshTopVisited();
}

async function getRecentVisited() {
  const result = await new Promise(resolve => {
    chrome.storage.local.get({ visitCounts: {} }, resolve);
  });
  return Object.entries(result.visitCounts)
    .map(([url, data]) => ({ url, title: data.title, lastVisit: data.lastVisit || 0 }))
    .sort((a, b) => b.lastVisit - a.lastVisit);
}

function renderTopVisited(items) {
  if (!items || items.length === 0) return '';
  let html = '<div class="top-visited">';
  html += '<div class="top-visited-title">最近使用</div>';
  html += '<div class="top-visited-grid">';
  items.forEach(item => {
    const t = escHtml(cleanTitle(item.title));
    html += `<a class="top-visited-item ${isShakeMode ? 'shake' : ''}" href="${escAttr(item.url)}" target="_blank" rel="noopener" data-url="${escAttr(item.url)}">
      ${isShakeMode ? '<span class="remove-badge" data-action="remove-visited">✕</span>' : ''}
      ${bmIconHtml(item.url, item.title)}
      <div class="top-visited-info">
        <div class="top-visited-name">${t}</div>
      </div>
    </a>`;
  });
  html += '</div></div>';
  return html;
}

async function refreshTopVisited() {
  const slot = document.getElementById('topVisitedSlot');
  if (!slot) return;
  const items = await getRecentVisited();
  if (items.length > 0) {
    slot.innerHTML = renderTopVisited(items);
    loadFavicons();
  } else {
    slot.innerHTML = '';
  }
}

// === 目录信息 ===
function getCategories() {
  return allCategories.filter(c => c.category !== '__root_bookmarks__');
}

// === 渲染 ===
function getValidCategories() {
  if (!_validCategories) {
    _validCategories = getCategories().filter(c => c.items.length > 0);
  }
  return _validCategories;
}

function renderData(data) {
  allCategories = data.categories || [];
  _validCategories = null;  // 数据变化，清空缓存
  const total = data.total || 0;
  const updateTime = data.last_update ? new Date(data.last_update * 1000).toLocaleString('zh-CN') : '';
  if (updateTime) document.getElementById('updateInfo').textContent = `${total} 书签 | ${updateTime}`;
  if (isSearchMode) return;
  renderMainView();
}

function renderMainView() {
  const content = document.getElementById('content');
  const validCategories = getValidCategories();

  let html = '';
  html += '<div id="topVisitedSlot"></div>';
  html += '<div class="category-grid">';
  validCategories.forEach((cat, i) => {
    const shortName = cat.category.split(' / ').pop();
    const isActive = activeCat === cat.category;
    html += `<div class="cat-card ${isActive ? 'active' : ''}" data-cat="${escAttr(cat.category)}" data-idx="${i}">
      <div class="cat-icon ico-${i % 8}">${catIcon(i)}</div>
      <div class="cat-name">${escHtml(shortName)}</div>
      <div class="cat-count">${cat.items.length} 书签</div>
    </div>`;
  });
  html += '</div>';

  if (activeCat) {
    html += renderBookmarkPanel(activeCat, validCategories);
  }

  content.innerHTML = html;
  bindContentEvents();
  loadFavicons();

  // 异步填充最近使用（requestAnimationFrame 避免与主渲染争抢）
  requestAnimationFrame(() => {
    getRecentVisited().then(items => {
      const slot = document.getElementById('topVisitedSlot');
      if (slot && items.length > 0) {
        slot.innerHTML = renderTopVisited(items);
        loadFavicons();
      }
    });
  });
}

function renderBookmarkPanel(categoryName, validCategories) {
  const catIdx = validCategories.findIndex(c => c.category === categoryName);
  const cat = validCategories[catIdx];
  if (!cat) return '';

  const shortName = categoryName.split(' / ').pop();
  const parentPath = categoryName.includes(' / ') ? categoryName.substring(0, categoryName.lastIndexOf(' / ')) : '';

  let html = '<div class="bookmark-panel">';
  html += '<div class="bookmark-panel-header">';
  html += `<span class="panel-icon ico-${catIdx % 8}">${catIcon(catIdx)}</span>`;
  html += `<span class="panel-title">${escHtml(shortName)}</span>`;
  if (parentPath) html += `<span class="panel-path">${escHtml(parentPath)}</span>`;
  html += `<span class="panel-count">${cat.items.length} 个书签</span>`;
  html += '<div class="panel-close" data-action="close-panel">✕</div>';
  html += '</div>';

  html += '<div class="bookmark-grid">';
  cat.items.forEach(item => {
    const t = escHtml(cleanTitle(item.title));
    const u = escHtml(item.url);
    html += `<a class="bookmark-item" href="${escAttr(item.url)}" target="_blank" rel="noopener">
      ${bmIconHtml(item.url, item.title)}
      <div class="bm-info"><div class="bm-title">${t}</div><div class="bm-url">${u}</div></div>
    </a>`;
  });
  html += '</div></div>';
  return html;
}

// === 交互 ===
let contentEventsBound = false;
let longPressTimer = null;

function bindContentEvents() {
  if (contentEventsBound) return;
  contentEventsBound = true;
  const content = document.getElementById('content');

  content.addEventListener('click', (e) => {
    // 晃动模式下点击非最近使用区域 → 退出晃动模式
    if (isShakeMode && !e.target.closest('.top-visited-item')) {
      isShakeMode = false;
      refreshTopVisited();
      return;
    }

    // 移除最近使用条目
    const removeBtn = e.target.closest('[data-action="remove-visited"]');
    if (removeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const item = removeBtn.closest('.top-visited-item');
      const url = item?.dataset.url;
      if (url) removeVisited(url);
      return;
    }

    // 书签点击 → 记录访问
    const bmItem = e.target.closest('a.bookmark-item[href]');
    if (bmItem) {
      recordVisit(bmItem.href, bmItem.querySelector('.bm-title')?.textContent || '');
    }

    // 最近使用点击 - 晃动模式下阻止跳转
    const tvItem = e.target.closest('a.top-visited-item[href]');
    if (tvItem) {
      if (isShakeMode) { e.preventDefault(); return; }
      recordVisit(tvItem.href, tvItem.querySelector('.top-visited-name')?.textContent || '');
    }

    // 目录卡片点击
    const card = e.target.closest('.cat-card[data-cat]');
    if (card) {
      activeCat = (activeCat === card.dataset.cat) ? null : card.dataset.cat;
      isSearchMode = false;
      renderMainView();
      return;
    }

    const closeBtn = e.target.closest('[data-action="close-panel"]');
    if (closeBtn) {
      activeCat = null;
      renderMainView();
      return;
    }
  });

  // 长按最近使用 → 进入/退出晃动模式
  content.addEventListener('pointerdown', (e) => {
    const tvItem = e.target.closest('.top-visited-item');
    if (!tvItem) return;
    longPressTimer = setTimeout(() => {
      isShakeMode = !isShakeMode;
      refreshTopVisited();
    }, 500);
  });

  const cancelLongPress = () => { clearTimeout(longPressTimer); };
  content.addEventListener('pointerup', cancelLongPress);
  content.addEventListener('pointermove', cancelLongPress);
  content.addEventListener('pointercancel', cancelLongPress);
}

// === 搜索 ===
const SEARCH_ENGINES = {
  bing: { name: 'Bing', url: 'https://cn.bing.com/search?q=' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  baidu: { name: '百度', url: 'https://www.baidu.com/s?wd=' }
};

let currentSearchEngine = 'bing';

async function loadSearchEngine() {
  const config = await new Promise(resolve => {
    chrome.storage.local.get({ searchEngine: 'bing' }, resolve);
  });
  currentSearchEngine = config.searchEngine;
}

function openSearch(query) {
  const v = query.trim();
  if (!v) return;
  // 如果是网址直接跳转
  if (v.startsWith('http') || v.includes('.')) {
    window.location.href = v.startsWith('http') ? v : 'https://' + v;
    return;
  }
  const engine = SEARCH_ENGINES[currentSearchEngine] || SEARCH_ENGINES.bing;
  window.location.href = engine.url + encodeURIComponent(v);
}

function setupSearch() {
  const input = document.getElementById('searchInput');
  const container = document.querySelector('.container');
  let timer = null;

  // 聚焦即触发上移
  input.addEventListener('focus', () => {
    container.classList.add('searching');
  });

  // 失焦且无输入时恢复
  input.addEventListener('blur', () => {
    if (!input.value.trim()) {
      container.classList.remove('searching');
    }
  });

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const v = input.value.trim();
    if (!v) {
      isSearchMode = false;
      renderMainView();
      return;
    }
    timer = setTimeout(() => { isSearchMode = true; activeCat = null; performSearch(v); }, 200);
  });

  // 回车仅在输入网址时直接跳转
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = input.value.trim();
      if (v && (v.startsWith('http') || v.includes('.'))) {
        window.location.href = v.startsWith('http') ? v : 'https://' + v;
      }
    }
  });

  // 右侧搜索按钮 → 搜索引擎
  document.getElementById('searchGo').addEventListener('click', () => {
    openSearch(input.value);
  });
}

function performSearch(keyword) {
  keyword = keyword.toLowerCase();
  const categories = getCategories();
  const engine = SEARCH_ENGINES[currentSearchEngine] || SEARCH_ENGINES.bing;

  // 搜索引擎提示条
  const displayKeyword = keyword.length > 30 ? keyword.substring(0, 30) + '...' : keyword;
  const searchUrl = engine.url + encodeURIComponent(keyword);
  let html = `<a class="search-engine-hint" href="${escAttr(searchUrl)}" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="currentColor"/></svg>
    在 ${escHtml(engine.name)} 中搜索「${escHtml(displayKeyword)}」
  </a>`;

  // 搜索书签
  let found = false;
  categories.forEach(cat => {
    const matched = cat.items.filter(item =>
      item.title.toLowerCase().includes(keyword) || item.url.toLowerCase().includes(keyword)
    );
    if (matched.length > 0) {
      found = true;
      html += `<div class="search-category">${escHtml(cat.category)}</div><div class="bookmark-grid">`;
      matched.forEach(item => {
        html += `<a class="bookmark-item" href="${escAttr(item.url)}" target="_blank" rel="noopener">
          ${bmIconHtml(item.url, item.title)}
          <div class="bm-info"><div class="bm-title">${escHtml(cleanTitle(item.title))}</div><div class="bm-url">${escHtml(item.url)}</div></div>
        </a>`;
      });
      html += '</div>';
    }
  });

  if (!found) html += '<div class="empty">未找到匹配的书签</div>';
  document.getElementById('content').innerHTML = html;
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

// === 天气/主题交互绑定（MV3 不允许 inline onclick） ===
document.getElementById('weatherIcon').addEventListener('click', toggleCityInput);
document.getElementById('weatherCityInput').addEventListener('keydown', handleCityInput);
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// === Bing 每日壁纸 ===
async function loadBingWallpaper() {
  // 读取设置，默认启用
  const config = await new Promise(resolve => {
    chrome.storage.local.get({ enableWallpaper: true }, resolve);
  });

  if (!config.enableWallpaper) {
    removeWallpaper();
    return;
  }

  // 先用缓存
  const cached = localStorage.getItem('ext_bing_wallpaper');
  const cachedDate = localStorage.getItem('ext_bing_wallpaper_date');
  const today = new Date().toISOString().slice(0, 10);

  if (cached && cachedDate === today) {
    applyWallpaper(cached);
    return;
  }

  try {
    const resp = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN');
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.images && data.images.length > 0) {
      const imgUrl = 'https://www.bing.com' + data.images[0].url;
      applyWallpaper(imgUrl);
      localStorage.setItem('ext_bing_wallpaper', imgUrl);
      localStorage.setItem('ext_bing_wallpaper_date', today);
    }
  } catch (e) {
    // 网络失败时用缓存（即使过期）
    if (cached) applyWallpaper(cached);
  }
}

function applyWallpaper(url) {
  document.body.style.backgroundImage = `url(${url})`;
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center';
  document.body.style.backgroundRepeat = 'no-repeat';
  document.body.classList.add('has-wallpaper');
}

function removeWallpaper() {
  document.body.style.backgroundImage = '';
  document.body.style.backgroundSize = '';
  document.body.style.backgroundPosition = '';
  document.body.style.backgroundRepeat = '';
  document.body.classList.remove('has-wallpaper');
}

// === 初始化 ===
initTheme();
loadSearchEngine();
updateClock();
updateCalendar();
setInterval(updateClock, 10000);
setInterval(updateCalendar, 60000);
setupSearch();
loadData();
initWeather();
loadBingWallpaper();
