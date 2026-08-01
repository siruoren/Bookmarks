// 全局状态
let allCategories = [];
let currentCat = null;
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
    const letter = el.dataset.letter;
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
    chrome.storage.local.get(['bookmarksCache'], result => {
      resolve(result.bookmarksCache || null);
    });
  });
}

function saveToCache(data) {
  chrome.storage.local.set({ bookmarksCache: data });
}

async function fetchFromBackend() {
  const config = await new Promise(resolve => {
    chrome.storage.local.get(['serverUrl', 'apiPassword'], resolve);
  });

  const serverUrl = config.serverUrl;
  if (!serverUrl) return null;

  const headers = {};
  if (config.apiPassword) {
    headers['X-API-Key'] = config.apiPassword;
  }

  try {
    const resp = await fetch(`${serverUrl}/api/bookmarks`, { headers });
    if (resp.ok) {
      const data = await resp.json();
      data._fetchTime = Date.now();
      saveToCache(data);
      return data;
    }
  } catch (e) {
    console.error('从后端获取数据失败:', e);
  }
  return null;
}

async function loadData() {
  // 优先使用缓存
  const cached = await loadFromCache();
  if (cached) {
    renderData(cached);
  }

  // 后台尝试更新
  const fresh = await fetchFromBackend();
  if (fresh) {
    renderData(fresh);
  } else if (!cached) {
    document.getElementById('content').innerHTML = '<div class="empty">未配置后端地址或无法连接<br><small>请点击右下角设置按钮进行配置</small></div>';
  }
}

// === 渲染 ===
function renderData(data) {
  allCategories = data.categories || [];
  const total = data.total || 0;
  const updateTime = data.last_update ? new Date(data.last_update * 1000).toLocaleString('zh-CN') : '';

  if (updateTime) {
    document.getElementById('updateInfo').textContent = `${total} 书签 | ${updateTime}`;
  }

  if (isSearchMode) return;
  if (currentCat) {
    renderCategoryDetail(currentCat);
  } else {
    renderOverview();
  }
}

function renderOverview() {
  const content = document.getElementById('content');
  const categories = allCategories.filter(c => c.category !== '__root_bookmarks__');

  let html = '';

  // 分类标签
  html += '<div class="category-tabs">';
  html += '<div class="cat-tab active" onclick="showAll()">全部</div>';
  categories.forEach(cat => {
    const shortName = cat.category.split(' / ').pop();
    html += `<div class="cat-tab" onclick="showCategory('${escJs(cat.category)}')">${escHtml(shortName)}</div>`;
  });
  html += '</div>';

  // 书签网格
  html += '<div class="bookmark-grid">';
  categories.forEach(cat => {
    cat.items.forEach(item => {
      const t = escHtml(cleanTitle(item.title));
      const u = escHtml(item.url);
      html += `<a class="bookmark-item" href="${escAttr(item.url)}" target="_blank" rel="noopener">
        ${bmIconHtml(item.url, item.title)}
        <div class="bm-info"><div class="bm-title">${t}</div><div class="bm-url">${u}</div></div>
      </a>`;
    });
  });
  html += '</div>';

  content.innerHTML = html;
  loadFavicons();
}

function showAll() {
  currentCat = null;
  isSearchMode = false;
  document.getElementById('searchInput').value = '';
  renderOverview();
  updateTabs(null);
}

function showCategory(name) {
  currentCat = name;
  isSearchMode = false;
  document.getElementById('searchInput').value = '';
  renderCategoryDetail(name);
  updateTabs(name);
}

function updateTabs(activeName) {
  document.querySelectorAll('.cat-tab').forEach(tab => {
    if (activeName === null && tab.textContent === '全部') {
      tab.classList.add('active');
    } else if (tab.textContent === activeName?.split(' / ').pop()) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
}

function renderCategoryDetail(categoryName) {
  const content = document.getElementById('content');
  const categories = allCategories.filter(c => c.category !== '__root_bookmarks__');
  const category = categories.find(c => c.category === categoryName);
  const idx = categories.findIndex(c => c.category === categoryName);

  // 查找子目录
  const subdirectories = categories.filter(c =>
    c.category !== categoryName &&
    c.category.startsWith(categoryName + ' / ')
  );

  let html = '<div class="back-btn" onclick="showAll()">← 返回全部</div>';
  html += `<div style="font-size:18px;font-weight:700;margin-bottom:16px;">
    <span class="ico-${idx >= 0 ? idx % 8 : 0}">${catIcon(idx >= 0 ? idx : 0)}</span> ${escHtml(categoryName)}
  </div>`;

  if (category && category.items.length > 0) {
    html += '<div class="bookmark-grid">';
    category.items.forEach(item => {
      const t = escHtml(cleanTitle(item.title));
      const u = escHtml(item.url);
      html += `<a class="bookmark-item" href="${escAttr(item.url)}" target="_blank" rel="noopener">
        ${bmIconHtml(item.url, item.title)}
        <div class="bm-info"><div class="bm-title">${t}</div><div class="bm-url">${u}</div></div>
      </a>`;
    });
    html += '</div>';
  }

  if (subdirectories.length > 0) {
    html += '<div class="subdir-grid">';
    subdirectories.forEach((subcat, i) => {
      const subName = escHtml(subcat.category.split(' / ').pop());
      const subIdx = categories.findIndex(c => c.category === subcat.category);
      html += `<div class="subdir-card" onclick="showCategory('${escJs(subcat.category)}')">
        <div class="subdir-icon ico-${subIdx >= 0 ? subIdx % 8 : i % 8}">${catIcon(subIdx >= 0 ? subIdx : i)}</div>
        <div class="subdir-name">${subName}</div>
        <div class="subdir-count">${subcat.items.length} 个书签</div>
      </div>`;
    });
    html += '</div>';
  }

  content.innerHTML = html;
  loadFavicons();
}

// === 搜索 ===
function setupSearch() {
  const input = document.getElementById('searchInput');
  let timer = null;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const v = input.value.trim();
    if (!v) {
      isSearchMode = false;
      if (currentCat) renderCategoryDetail(currentCat);
      else renderOverview();
      return;
    }
    timer = setTimeout(() => {
      isSearchMode = true;
      currentCat = null;
      performSearch(v);
    }, 200);
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
  const categories = allCategories.filter(c => c.category !== '__root_bookmarks__');
  const content = document.getElementById('content');

  let html = '<div class="back-btn" onclick="showAll()">← 返回全部</div>';
  let found = false;

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

  if (!found) {
    html += '<div class="empty">未找到匹配的书签</div>';
  }

  content.innerHTML = html;
  loadFavicons();
}

// === 后台更新监听 ===
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'bookmarksUpdated') {
    allCategories = msg.data.categories || [];
    if (isSearchMode) return;
    if (currentCat) renderCategoryDetail(currentCat);
    else renderOverview();

    const total = msg.data.total || 0;
    const updateTime = msg.data.last_update ? new Date(msg.data.last_update * 1000).toLocaleString('zh-CN') : '';
    if (updateTime) {
      document.getElementById('updateInfo').textContent = `${total} 书签 | ${updateTime}`;
    }
  }
});

// === 设置按钮 ===
document.getElementById('settingsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// === 初始化 ===
updateClock();
setInterval(updateClock, 10000);
setupSearch();
loadData();

// 聚焦搜索框
setTimeout(() => document.getElementById('searchInput').focus(), 100);
