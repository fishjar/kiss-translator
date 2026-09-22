import { browser } from "./browser";

/**
 * This self-contained function runs in the extension's isolated world, both
 * from its content script and through scripting.executeScript. Its token
 * belongs to the document, including across runtime restarts and BFCache.
 */
export function getPopupDocumentIdentity() {
  const key = "__KISS_TRANSLATOR_DOCUMENT_TOKEN__";
  if (!globalThis[key]) {
    const values = new Uint32Array(4);
    globalThis.crypto.getRandomValues(values);
    Object.defineProperty(globalThis, key, { value: values.join("-") });
  }
  return { token: globalThis[key], url: globalThis.location.href };
}

/** Verify the responding frame itself, without injecting into other frames. */
export async function isCurrentPopupDocument(tabId, documentInfo) {
  if (
    !Number.isInteger(tabId) ||
    !Number.isInteger(documentInfo?.frameId) ||
    !documentInfo?.token ||
    (typeof browser?.scripting?.executeScript !== "function" &&
      typeof browser?.tabs?.executeScript !== "function")
  ) {
    return false;
  }
  try {
    const tab = await browser.tabs.get(tabId);
    // Before a navigation commits, the old document can still execute scripts.
    if (tab.pendingUrl) return false;
    if (typeof browser?.scripting?.executeScript === "function") {
      const results = await browser.scripting.executeScript({
        target: { tabId, frameIds: [documentInfo.frameId] },
        injectImmediately: true,
        func: getPopupDocumentIdentity,
      });
      return results.some(
        ({ frameId, result }) =>
          frameId === documentInfo.frameId &&
          result?.token === documentInfo.token
      );
    }
    // Thunderbird 78-101 and older MV2 hosts expose the same isolated-world
    // injection through tabs.executeScript. Still verify the exact frame token.
    const [result] = await browser.tabs.executeScript(tabId, {
      frameId: documentInfo.frameId,
      matchAboutBlank: true,
      runAt: "document_start",
      code: `(${getPopupDocumentIdentity.toString()})()`,
    });
    return result?.token === documentInfo.token;
  } catch {
    // Navigation, a removed frame, and restricted documents can reject injection.
    // Never fall back to accepting a snapshot whose document was not verified.
    return false;
  }
}
