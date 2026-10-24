const KEY = "kiss-diagnostics-detail";
export const DETAIL_TTL = 30 * 60 * 1000;
// A per-session deadline survives worker suspension, but never a browser restart.
export function createDetailPolicy(browser, now = Date.now) {
  let memory = 0;
  const status = async () => {
    try {
      const expiresAt = browser.storage?.session
        ? (await browser.storage.session.get(KEY))[KEY] || 0
        : memory;
      return {
        enabled: expiresAt > now(),
        expiresAt: expiresAt > now() ? expiresAt : 0,
      };
    } catch {
      return { enabled: false, expiresAt: 0 };
    }
  };
  return {
    status,
    async set(enabled) {
      const expiresAt = enabled ? now() + DETAIL_TTL : 0;
      if (browser.storage?.session)
        await browser.storage.session.set({ [KEY]: expiresAt });
      else memory = expiresAt;
      return status();
    },
  };
}
