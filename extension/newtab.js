// 全局状态
let allCategories = [];
let _validCategories = null;  // 缓存过滤后的有效目录
let _localBookmarkCategories = [];  // 浏览器本地书签
let _localBookmarksLoaded = false;
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

  const {lunar, term} = getLunarInfo(now);
  const dateStr = now.toLocaleDateString('zh-CN', {year: 'numeric', month: 'long', day: 'numeric'});
  document.getElementById('date').textContent = lunar ? `${dateStr} ${lunar}` : dateStr;

  const weekday = now.toLocaleDateString('zh-CN', {weekday: 'short'});
  document.getElementById('weekday').textContent = term ? `${weekday} ${term}` : weekday;
}

function getLunarInfo(date) {
  const lunarMonthNames = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
  const lunarDays = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
    '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
    '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
  const terms = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满',
    '芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降',
    '立冬','小雪','大雪','冬至'];

  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();

  // 节气检查
  let termName = '';
  const termIdx = m * 2 + (d > 15 ? 1 : 0);
  if (termIdx < terms.length) {
    const termDates = [6,20,4,19,6,21,5,20,6,21,6,22,7,23,7,23,8,23,8,23,7,22,7,22];
    if (Math.abs(d - termDates[termIdx]) <= 1) termName = terms[termIdx];
  }

  // 各年春节公历日期和闰月序号（0=无闰月）
  const SPRINGS = {
    2024: { m: 2, d: 10, leap: 0 },
    2025: { m: 1, d: 29, leap: 6 },
    2026: { m: 2, d: 17, leap: 0 },
    2027: { m: 2, d: 6,  leap: 0 },
    2028: { m: 1, d: 26, leap: 0 },
    2029: { m: 2, d: 13, leap: 0 },
    2030: { m: 2, d: 3,  leap: 0 },
  };

  let springInfo = SPRINGS[y];
  let springDate = springInfo ? new Date(y, springInfo.m - 1, springInfo.d) : null;
  let diffDays = springDate ? Math.floor((date - springDate) / 86400000) : -1;

  // 春节前属于上一农历年
  if (diffDays < 0) {
    const prevInfo = SPRINGS[y - 1];
    if (prevInfo) {
      springInfo = prevInfo;
      springDate = new Date(y - 1, prevInfo.m - 1, prevInfo.d);
      diffDays = Math.floor((date - springDate) / 86400000);
    } else {
      // 无数据年份 fallback
      const dayOfYear = Math.floor((date - new Date(y, 0, 0)) / 86400000);
      const lunarDay = lunarDays[(dayOfYear + 15) % 30] || '';
      return { lunar: lunarDay, term: termName };
    }
  }

  // 按大小月交替推算（30,29交替，简化但近似合理）
  const leapMonth = springInfo.leap;
  const totalMonths = leapMonth > 0 ? 13 : 12;
  let remaining = diffDays;
  let monthIdx = 0;

  for (let i = 0; i < totalMonths; i++) {
    const days = (i % 2 === 0) ? 30 : 29;
    if (remaining < days) {
      monthIdx = i;
      break;
    }
    remaining -= days;
    if (i === totalMonths - 1) { monthIdx = i; }
  }

  // 月份名称（含闰月处理）
  let monthName;
  if (leapMonth > 0 && monthIdx === leapMonth) {
    monthName = '闰' + lunarMonthNames[leapMonth - 1] + '月';
  } else if (leapMonth > 0 && monthIdx > leapMonth) {
    monthName = lunarMonthNames[monthIdx - 1] + '月';
  } else {
    monthName = lunarMonthNames[Math.min(monthIdx, 11)] + '月';
  }

  const dayName = lunarDays[remaining] || '';
  return { lunar: monthName + dayName, term: termName };
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

// 通过 background 代理 fetch（Firefox MV3 扩展页面直接 fetch 会 NetworkError）
function proxyFetch(url, options) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'proxyFetch', url, options }, resp => {
      if (!resp) { reject(new Error('background 无响应')); return; }
      if (resp.error) { reject(new Error(resp.error)); return; }
      resolve({
        ok: resp.ok,
        status: resp.status,
        json: () => Promise.resolve(JSON.parse(resp.body)),
        text: () => Promise.resolve(resp.body)
      });
    });
  });
}

async function fetchFromBackend() {
  const config = await new Promise(resolve => chrome.storage.local.get(['serverUrl', 'apiPassword'], resolve));
  if (!config.serverUrl) return null;

  const serverUrl = toFetchUrl(config.serverUrl);
  const headers = config.apiPassword ? { 'X-API-Key': config.apiPassword } : {};
  try {
    const resp = await proxyFetch(`${serverUrl}/api/bookmarks`, { headers });
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
  // 加载浏览器本地书签
  await loadLocalBookmarks();
  const cached = await loadFromCache();
  if (cached) {
    await renderDataWithVisited(cached);
  }
  const fresh = await fetchFromBackend();
  if (fresh) {
    // 缓存和最新数据相同时不重复渲染
    if (cached && fresh.last_update === cached.last_update && fresh.total === cached.total) return;
    await renderDataWithVisited(fresh);
  } else if (!cached) {
    if (_localBookmarkCategories.length > 0) {
      // 无后端数据但有本地书签，仍显示
      allCategories = [];
      _validCategories = null;
      const recentItems = await getRecentVisited();
      renderMainView(recentItems);
    } else {
      document.getElementById('content').innerHTML = '<div class="empty">未配置后端地址或无法连接<br><small>请点击右上角设置按钮进行配置</small></div>';
    }
  }
}

// 统一渲染：先加载最近使用，再一次性渲染，避免异步插入导致闪屏
async function renderDataWithVisited(data) {
  allCategories = data.categories || [];
  _validCategories = null;
  const total = data.total || 0;
  const updateTime = data.last_update ? new Date(data.last_update * 1000).toLocaleString('zh-CN') : '';
  if (updateTime) document.getElementById('updateInfo').textContent = `${total} 书签 | 更新于 ${updateTime}`;
  if (isSearchMode) return;

  const recentItems = await getRecentVisited();
  renderMainView(recentItems);
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
    .sort((a, b) => b.lastVisit - a.lastVisit)
    .slice(0, 18);
}

function renderTopVisited(items) {
  if (!items || items.length === 0) return '';
  let html = '<div class="top-visited">';
  html += '<div class="top-visited-title">最近使用</div>';
  html += '<div class="top-visited-grid">';
  items.forEach(item => {
    // 最近使用只显示书签名，去掉「目录名 - 」前缀
    let name = cleanTitle(item.title);
    const dashIdx = name.indexOf(' - ');
    if (dashIdx > 0) name = name.substring(dashIdx + 3);
    const t = escHtml(name);
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
  const items = await getRecentVisited();
  if (isSearchMode) return;
  renderMainView(items);
}

// === 浏览器本地书签 ===
function loadLocalBookmarks() {
  if (!chrome.bookmarks) {
    _localBookmarksLoaded = true;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((tree) => {
      _localBookmarkCategories = [];
      // 递归遍历书签树，跳过根节点的第一层（"书签栏"等）
      function walk(nodes, parentPath) {
        for (const node of nodes) {
          if (node.url) {
            // 书签条目，归入当前目录
            const catName = parentPath || '浏览器书签';
            let cat = _localBookmarkCategories.find(c => c.category === catName);
            if (!cat) {
              cat = { category: catName, items: [] };
              _localBookmarkCategories.push(cat);
            }
            cat.items.push({ title: node.title || node.url, url: node.url });
          } else if (node.children && node.children.length) {
            // 目录节点
            const childPath = parentPath ? parentPath + ' / ' + node.title : node.title;
            walk(node.children, childPath);
          }
        }
      }
      if (tree[0] && tree[0].children) {
        // 跳过根节点，直接从"书签栏/其他书签"等开始
        for (const rootChild of tree[0].children) {
          walk(rootChild.children || [], rootChild.title);
        }
      }
      _localBookmarksLoaded = true;
      resolve();
    });
  });
}

// === 目录信息 ===
function getCategories() {
  const serverCats = allCategories.filter(c => c.category !== '__root_bookmarks__');
  if (!_localBookmarksLoaded || _localBookmarkCategories.length === 0) return serverCats;

  // 合并：按显示的目录名（短名）去重合并条目
  const shortName = c => c.category.split(' / ').pop();
  const merged = serverCats.map(c => ({ ...c, items: [...c.items] }));
  for (const localCat of _localBookmarkCategories) {
    const existing = merged.find(c => shortName(c) === shortName(localCat));
    if (existing) {
      // 合并条目，按URL去重
      const existingUrls = new Set(existing.items.map(i => i.url));
      for (const item of localCat.items) {
        if (!existingUrls.has(item.url)) existing.items.push(item);
      }
    } else {
      merged.push({ ...localCat });
    }
  }
  return merged;
}

// === 渲染 ===
function getValidCategories() {
  if (!_validCategories) {
    _validCategories = getCategories().filter(c => c.items.length > 0);
  }
  return _validCategories;
}

function renderMainView(recentItems) {
  const content = document.getElementById('content');
  const validCategories = getValidCategories();

  let html = '';
  // 最近使用直接内联渲染，避免异步插入导致闪屏
  if (recentItems && recentItems.length > 0) {
    html += renderTopVisited(recentItems);
  } else if (!recentItems) {
    // 无参调用时先占位，异步填充最近使用
    html += '<div id="topVisitedSlot"></div>';
  }
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

  // 无参调用时异步填充最近使用
  if (!recentItems) {
    getRecentVisited().then(items => {
      const slot = document.getElementById('topVisitedSlot');
      if (slot && items.length > 0) {
        slot.outerHTML = renderTopVisited(items);
        loadFavicons();
      } else if (slot) {
        slot.remove();
      }
    });
  }
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
    const t = escHtml(shortName) + ' - ' + escHtml(cleanTitle(item.title));
    const u = escHtml(item.url);
    html += `<a class="bookmark-item" href="${escAttr(item.url)}" target="_blank" rel="noopener">
      ${bmIconHtml(item.url, item.title)}
      <div class="bm-info"><div class="bm-title">${t}</div><div class="bm-url">${u}</div></div>
    </a>`;
  });
  html += '</div></div>';
  return html;
}

// 切换目录展开（针对性 DOM 更新，避免全量重渲染导致闪烁）
function toggleCategory(catName) {
  const wasActive = activeCat === catName;
  activeCat = wasActive ? null : catName;
  isSearchMode = false;

  const content = document.getElementById('content');

  // 更新卡片高亮状态
  content.querySelectorAll('.cat-card').forEach(card => {
    card.classList.toggle('active', card.dataset.cat === activeCat);
  });

  // 移除旧面板
  const oldPanel = content.querySelector('.bookmark-panel');
  if (oldPanel) oldPanel.remove();

  // 收起时重置滚动位置，避免残留黑条
  if (wasActive) {
    document.querySelector('.container').scrollTop = 0;
  }

  // 添加新面板
  if (activeCat) {
    const validCategories = getValidCategories();
    const panelHtml = renderBookmarkPanel(activeCat, validCategories);
    if (panelHtml) {
      const grid = content.querySelector('.category-grid');
      grid.insertAdjacentHTML('afterend', panelHtml);
      loadFavicons();
    }
  }
}

// 关闭书签面板
function closeBookmarkPanel() {
  activeCat = null;
  const content = document.getElementById('content');
  content.querySelectorAll('.cat-card').forEach(card => card.classList.remove('active'));
  const panel = content.querySelector('.bookmark-panel');
  if (panel) panel.remove();
  document.querySelector('.container').scrollTop = 0;
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

    // 书签点击 → 记录访问（只存纯书签名，去掉目录前缀）
    const bmItem = e.target.closest('a.bookmark-item[href]');
    if (bmItem) {
      let bmTitle = bmItem.querySelector('.bm-title')?.textContent || '';
      const dashIdx = bmTitle.indexOf(' - ');
      if (dashIdx > 0) bmTitle = bmTitle.substring(dashIdx + 3);
      recordVisit(bmItem.href, bmTitle);
    }

    // 最近使用点击 - 晃动模式下阻止跳转
    const tvItem = e.target.closest('a.top-visited-item[href]');
    if (tvItem) {
      if (isShakeMode) { e.preventDefault(); return; }
      recordVisit(tvItem.href, tvItem.querySelector('.top-visited-name')?.textContent || '');
    }

    // 搜索结果目录卡片点击（展开/收起切换）
    const folderCard = e.target.closest('.cat-card[data-cat]');
    if (folderCard && isSearchMode) {
      const catName = folderCard.dataset.cat;
      const catIdx = parseInt(folderCard.dataset.idx);
      const isActive = folderCard.classList.contains('active');
      // 切换 active
      content.querySelectorAll('.cat-card').forEach(c => c.classList.remove('active'));
      folderCard.classList.toggle('active', !isActive);
      toggleSearchFolder(catName, catIdx, isActive);
      return;
    }

    const card = e.target.closest('.cat-card[data-cat]');
    if (card) {
      toggleCategory(card.dataset.cat);
      return;
    }

    const closeBtn = e.target.closest('[data-action="close-panel"]');
    if (closeBtn) {
      closeBookmarkPanel();
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
  const clearBtn = document.getElementById('searchClear');
  let timer = null;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const v = input.value.trim();
    clearBtn.classList.toggle('show', input.value.length > 0);
    if (!v) {
      isSearchMode = false;
      renderMainView();
      return;
    }
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

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.remove('show');
    isSearchMode = false;
    activeCat = null;
    renderMainView();
    input.focus();
  });

  document.getElementById('searchGo').addEventListener('click', () => {
    openSearch(input.value);
  });
}

function performSearch(keyword) {
  // 多关键词：空格分隔，全部匹配（AND）
  const keywords = keyword.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) return;
  const categories = getCategories();
  const engine = SEARCH_ENGINES[currentSearchEngine] || SEARCH_ENGINES.bing;

  // 多关键词模糊匹配：文本或拼音中包含所有关键词
  function matchAll(text, kwds) {
    const lower = text.toLowerCase();
    return kwds.every(k => lower.includes(k) || pinyin.match(text, k));
  }

  // 搜索引擎提示条
  const displayKeyword = keyword.length > 30 ? keyword.substring(0, 30) + '...' : keyword;
  const searchUrl = engine.url + encodeURIComponent(keyword);
  let html = `<a class="search-engine-hint" href="${escAttr(searchUrl)}" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="currentColor"/></svg>
    在 ${escHtml(engine.name)} 中搜索「${escHtml(displayKeyword)}」
  </a>`;

  // 分类搜索结果：目录名匹配 vs 书签名/URL匹配
  const catMatched = [];   // 目录名匹配的分类
  const itemMatched = [];  // 书签条目匹配的分类（目录名不匹配）

  categories.forEach((cat, idx) => {
    const shortName = cat.category.split(' / ').pop();
    const isCatMatch = matchAll(shortName, keywords) || matchAll(cat.category, keywords);

    const matchedItems = cat.items.filter(item =>
      matchAll(item.title, keywords) || keywords.every(k => item.url.toLowerCase().includes(k))
    );

    if (isCatMatch) {
      catMatched.push({ cat, idx, matchedItems });
    } else if (matchedItems.length > 0) {
      itemMatched.push({ cat, matched: matchedItems, idx });
    }
  });

  let found = catMatched.length > 0 || itemMatched.length > 0;

  // 区域1：匹配的目录（使用 category-grid 卡片样式，类似首页）
  if (catMatched.length > 0) {
    html += '<div class="category-grid">';
    catMatched.forEach(({ cat, idx }) => {
      const shortName = cat.category.split(' / ').pop();
      html += `<div class="cat-card" data-cat="${escAttr(cat.category)}" data-idx="${idx}">
        <div class="cat-icon ico-${idx % 8}">${catIcon(idx)}</div>
        <div class="cat-name">${escHtml(shortName)}</div>
        <div class="cat-count">${cat.items.length} 书签</div>
      </div>`;
    });
    html += '</div>';
    // 展开的目录条目容器
    html += '<div id="searchFolderContent"></div>';
  }

  // 区域2：所有匹配的条目列表
  const allMatchedItems = [];
  catMatched.forEach(({ cat, matchedItems }) => {
    matchedItems.forEach(item => allMatchedItems.push({ item, cat }));
  });
  itemMatched.forEach(({ cat, matched }) => {
    matched.forEach(item => allMatchedItems.push({ item, cat }));
  });

  if (allMatchedItems.length > 0) {
    html += '<div class="search-matched-list">';
    html += '<div class="bookmark-grid">';
    allMatchedItems.forEach(({ item, cat }) => {
      const catShortName = cat.category.split(' / ').pop();
      html += `<a class="bookmark-item" href="${escAttr(item.url)}" target="_blank" rel="noopener">
        ${bmIconHtml(item.url, item.title)}
        <div class="bm-info"><div class="bm-title">${escHtml(catShortName)} - ${escHtml(cleanTitle(item.title))}</div><div class="bm-url">${escHtml(item.url)}</div></div>
      </a>`;
    });
    html += '</div></div>';
  }

  if (!found) html += '<div class="empty">未找到匹配的书签</div>';
  document.getElementById('content').innerHTML = html;
  loadFavicons();
}

// 搜索结果：展开/收起目录
function toggleSearchFolder(catName, catIdx, isActive) {
  const container = document.getElementById('searchFolderContent');
  const matchedList = document.querySelector('.search-matched-list');
  if (!container) return;

  if (isActive) {
    // 收起：清空展开内容，显示匹配条目列表
    container.innerHTML = '';
    if (matchedList) matchedList.style.display = '';
  } else {
    // 展开：显示目录全部条目，隐藏匹配条目列表
    if (matchedList) matchedList.style.display = 'none';

    const cat = getCategories().find(c => c.category === catName);
    if (!cat) return;

    const shortName = cat.category.split(' / ').pop();
    let html = '<div class="bookmark-panel">';
    html += '<div class="bookmark-panel-header">';
    html += `<span class="panel-icon ico-${catIdx % 8}">${catIcon(catIdx)}</span>`;
    html += `<span class="panel-title">${escHtml(shortName)}</span>`;
    html += `<span class="panel-count">${cat.items.length} 个书签</span>`;
    html += '</div>';
    html += '<div class="bookmark-grid">';
    cat.items.forEach(item => {
      const t = escHtml(shortName) + ' - ' + escHtml(cleanTitle(item.title));
      const u = escHtml(item.url);
      html += `<a class="bookmark-item" href="${escAttr(item.url)}" target="_blank" rel="noopener">
        ${bmIconHtml(item.url, item.title)}
        <div class="bm-info"><div class="bm-title">${t}</div><div class="bm-url">${u}</div></div>
      </a>`;
    });
    html += '</div></div>';
    container.innerHTML = html;
    loadFavicons();
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// === 后台更新监听 ===
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'bookmarksUpdated') {
    allCategories = msg.data.categories || [];
    _validCategories = null;
    const total = msg.data.total || 0;
    const updateTime = msg.data.last_update ? new Date(msg.data.last_update * 1000).toLocaleString('zh-CN') : '';
    if (updateTime) document.getElementById('updateInfo').textContent = `${total} 书签 | 更新于 ${updateTime}`;
    if (isSearchMode) return;
    getRecentVisited().then(items => renderMainView(items));
  }
});

// === 浏览器本地书签变化监听 ===
if (chrome.bookmarks && chrome.bookmarks.onChanged) {
  const refreshLocal = () => {
    loadLocalBookmarks().then(() => {
      _validCategories = null;
      if (isSearchMode) return;
      getRecentVisited().then(items => renderMainView(items));
    });
  };
  chrome.bookmarks.onCreated.addListener(refreshLocal);
  chrome.bookmarks.onRemoved.addListener(refreshLocal);
  chrome.bookmarks.onChanged.addListener(refreshLocal);
  chrome.bookmarks.onMoved.addListener(refreshLocal);
}

// === 保存远程书签到本地 ===
async function saveRemoteToLocal() {
  const btn = document.getElementById('saveBmBtn');
  if (btn.classList.contains('saving')) return;
  btn.classList.add('saving');

  try {
    if (!chrome || !chrome.bookmarks) {
      showToast('当前环境不支持浏览器书签API');
      return;
    }
    const remoteCats = allCategories.filter(c => c.category !== '__root_bookmarks__');
    if (!remoteCats.length) {
      showToast('没有远程书签可保存');
      return;
    }

    // URL 规范化：统一解码、去末尾/，避免编码/斜杠差异导致去重失败
    function normUrl(u) {
      if (!u) return '';
      try { u = decodeURIComponent(u); } catch {}
      u = u.replace(/\/+$/, '');           // 去掉路径末尾的 /
      return u;
    }

    // 带超时的 Promise 包装
    function bmCall(fn, ...args) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('操作超时')), 10000);
        fn(...args, (result) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });
    }

    // 收集本地已有书签URL（全量去重）
    const localTree = await bmCall(chrome.bookmarks.getTree);
    const localUrls = new Set();
    function collectUrls(nodes) {
      for (const n of nodes) {
        if (n.url) localUrls.add(normUrl(n.url));
        if (n.children) collectUrls(n.children);
      }
    }
    if (localTree[0]) collectUrls(localTree[0].children || []);

    // 获取书签栏ID
    const barId = localTree[0]?.children?.[0]?.id;
    if (!barId) { showToast('无法获取书签栏'); return; }

    let saved = 0, skipped = 0;

    for (const cat of remoteCats) {
      const catName = cat.category.split(' / ').pop();
      // 先统计该目录下有多少新书签需要添加
      const newItems = cat.items.filter(item => !localUrls.has(normUrl(item.url)));
      if (newItems.length === 0) { skipped += cat.items.length; continue; }

      // 创建或查找目录文件夹
      const subTree = await bmCall(chrome.bookmarks.getChildren, barId);
      let folder = subTree.find(n => n.title === catName && !n.url);
      if (!folder) {
        folder = await bmCall(chrome.bookmarks.create, { parentId: barId, title: catName });
      }

      // 逐条添加书签（标题去掉目录前缀）
      for (const item of newItems) {
        let bmTitle = item.title || '';
        const dashIdx = bmTitle.indexOf(' - ');
        if (dashIdx > 0) bmTitle = bmTitle.substring(dashIdx + 3);
        const created = await bmCall(chrome.bookmarks.create, { parentId: folder.id, title: bmTitle, url: item.url });
        localUrls.add(normUrl(created.url || item.url));
        saved++;
      }
      skipped += cat.items.length - newItems.length;
    }

    if (saved === 0 && skipped > 0) {
      showToast(`所有 ${skipped} 个远程书签已存在于本地，无需添加`);
    } else {
      showToast(`保存完成：新增 ${saved} 个，跳过 ${skipped} 个已存在`);
    }
  } catch (e) {
    console.error('[SeeTab] 保存远程书签失败:', e);
    showToast('保存失败：' + (e.message || e));
  } finally {
    btn.classList.remove('saving');
  }
}

function showToast(msg) {
  const old = document.querySelector('.save-bm-toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'save-bm-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

document.getElementById('saveBmBtn').addEventListener('click', saveRemoteToLocal);

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
setInterval(updateClock, 10000);
setupSearch();
loadData();
initWeather();
loadBingWallpaper();
