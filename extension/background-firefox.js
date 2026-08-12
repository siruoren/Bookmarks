// Firefox 后台脚本 - 新标签页和主页接管逻辑

const NEWTAB_URL = chrome.runtime.getURL('newtab.html');

// 监听新标签页/主页打开并重定向
chrome.tabs.onCreated.addListener((tab) => {
  const url = tab.pendingUrl || tab.url || '';
  if (url === 'about:newtab' || url === 'about:home') {
    setTimeout(() => {
      chrome.tabs.update(tab.id, { url: NEWTAB_URL }).catch(() => {});
    }, 50);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    const url = tab.pendingUrl || tab.url || '';
    if (url === 'about:newtab' || url === 'about:home') {
      chrome.tabs.update(tabId, { url: NEWTAB_URL }).catch(() => {});
    }
  }
});
