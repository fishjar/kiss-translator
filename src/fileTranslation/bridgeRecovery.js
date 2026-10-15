import browser from "webextension-polyfill";
import { isFileBridgePage } from "./protocol";
import { kissLog } from "../libs/log";

export async function restoreFileTranslationBridges() {
  // Only builds that ship the file bridge may inject it into existing tabs.
  if (!["chrome", "firefox"].includes(process.env.REACT_APP_CLIENT)) return;
  try {
    const tabs = await browser.tabs.query({});
    await Promise.all(
      tabs
        .filter((tab) => isFileBridgePage(tab.url))
        .map(async (tab) => {
          try {
            if (browser.runtime.getManifest().manifest_version === 2) {
              await browser.tabs.executeScript(tab.id, {
                file: "file-bridge.js",
                allFrames: false,
                runAt: "document_start",
              });
            } else {
              await browser.scripting.executeScript({
                target: { tabId: tab.id, frameIds: [0] },
                files: ["file-bridge.js"],
              });
            }
          } catch (error) {
            kissLog("restore file translation bridge", error);
          }
        })
    );
  } catch (error) {
    kissLog("find file translation pages", error);
  }
}
