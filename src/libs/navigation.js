/**
 * @file navigation.js
 * @description 页面导航与独立窗口/标签页打开工具函数
 */

/**
 * 在新标签页中打开独立的文件翻译页面
 */
export async function openFileTranslatePage() {
  const browserApi = globalThis.browser || globalThis.chrome;
  try {
    if (browserApi?.tabs?.create) {
      const getURL = browserApi?.runtime?.getURL || ((p) => p);
      await browserApi.tabs.create({
        url: getURL("file-translate.html"),
      });
      return;
    }
  } catch (err) {
    // 忽略异常，降级至 window.open
  }
  const getURL = browserApi?.runtime?.getURL;
  const url = getURL ? getURL("file-translate.html") : "file-translate.html";
  window.open(url, "_blank");
}

/**
 * 打开设置页面
 */
export async function openOptionsPage() {
  const browserApi = globalThis.browser || globalThis.chrome;
  try {
    if (browserApi?.runtime?.openOptionsPage) {
      await browserApi.runtime.openOptionsPage();
      return;
    }
    if (browserApi?.tabs?.create) {
      const getURL = browserApi?.runtime?.getURL || ((p) => p);
      await browserApi.tabs.create({ url: getURL("options.html") });
      return;
    }
  } catch (err) {
    // 忽略异常，降级 window.open
  }
  const getURL = browserApi?.runtime?.getURL;
  const url = getURL ? getURL("options.html") : "options.html";
  window.open(url, "_blank");
}
