// 请求在页面侧构建，缓存随页面运行环境销毁；不持久化或发送页面 URL。
const sessions = new Map();
let currentPageUrl;

const createSessionId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  // HTTP 页面上 randomUUID 可能不可用，getRandomValues 仍可使用。
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
};

/** 同一页面、同一接口的段落、重试和辅助请求复用会话 ID。 */
export const getOpenCodeSessionId = ({ apiSlug, url }) => {
  const pageUrl = globalThis.location?.href || "";
  // SPA 导航不一定重建脚本运行环境，因此在地址变化时开始新会话。
  if (pageUrl !== currentPageUrl) {
    sessions.clear();
    currentPageUrl = pageUrl;
  }

  const scope = JSON.stringify([apiSlug, url]);
  if (!sessions.has(scope)) {
    sessions.set(scope, createSessionId());
  }
  return sessions.get(scope);
};
