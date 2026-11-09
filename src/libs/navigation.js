/**
 * @file navigation.js
 * @description 页面导航与独立窗口/标签页打开工具函数
 */
import { FILE_WEB_URL } from "../fileTranslation/protocol";
import { MSG_OPEN_OPTIONS } from "../config/msg";
import { isExt } from "./client";

/**
 * 在新标签页中打开独立的文件翻译页面
 */
export async function openFileTranslatePage() {
  const browserApi = globalThis.browser || globalThis.chrome;
  try {
    if (browserApi?.tabs?.create) {
      await browserApi.tabs.create({
        url:
          process.env.REACT_APP_FILE_BRIDGE_DEV === "true"
            ? "http://localhost:3000/file-translate.html"
            : FILE_WEB_URL,
      });
      return;
    }
  } catch (err) {
    // 忽略异常，降级至 window.open
  }
  const url =
    process.env.REACT_APP_FILE_BRIDGE_DEV === "true"
      ? "http://localhost:3000/file-translate.html"
      : FILE_WEB_URL;
  window.open(url, "_blank");
}

export async function openOptionsPage(path = "") {
  const hash = path ? (path.startsWith("#") ? path : `#${path}`) : "";
  if (process.env.REACT_APP_CLIENT !== "web" && isExt) {
    // Keep extension messaging out of the standalone website's module graph.
    const { sendBgMsg } = require("./msg");
    return sendBgMsg(MSG_OPEN_OPTIONS, { path: hash });
  }
  window.open(
    `${process.env.REACT_APP_OPTIONSPAGE}${hash}`,
    "_blank",
    "noopener,noreferrer"
  );
}
