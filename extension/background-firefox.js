// Firefox 后台脚本 - 新标签页和主页接管逻辑
// 注意：background.js 已在 manifest scripts 中先加载，无需 importScripts

// === Firefox 新标签页/主页接管 ===
// chrome_url_overrides.newtab 仅在正式安装时生效
// 此脚本通过 webNavigation 拦截 about:newtab 和 about:home 作为补充

const NEWTAB_URL = chrome.runtime.getURL('newtab.html');

// 方式1: webNavigation.onBeforeNavigate 拦截（需要 webNavigation 权限）
if (chrome.webNavigation && chrome.webNavigation.onBeforeNavigate) {
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.url === 'about:newtab' || details.url === 'about:home') {
      chrome.tabs.update(details.tabId, { url: NEWTAB_URL });
    }
  }, {
    url: [
      { urlEquals: 'about:newtab' },
      { urlEquals: 'about:home' }
    ]
  });
}

// 方式2: tabs.onCreated 作为 fallback（webNavigation 过滤可能不匹配 about: 页面）
chrome.tabs.onCreated.addListener((tab) => {
  const url = tab.pendingUrl || tab.url || '';
  if (url === 'about:newtab' || url === 'about:home') {
    // 延迟执行，等待 tab id 稳定
    setTimeout(() => {
      chrome.tabs.update(tab.id, { url: NEWTAB_URL }).catch(() => {});
    }, 50);
  }
});

// 方式3: 拦截标签页加载完成时仍为 about:newtab/about:home 的情况
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    const url = tab.pendingUrl || tab.url || '';
    if (url === 'about:newtab' || url === 'about:home') {
      chrome.tabs.update(tabId, { url: NEWTAB_URL }).catch(() => {});
    }
  }
});
