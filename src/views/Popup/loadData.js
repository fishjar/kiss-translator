import { MSG_TRANS_GETRULE } from "../../config";
import { browser } from "../../libs/browser";
import { getCurTab, sendTabMsg } from "../../libs/msg";

const sleep = (milliseconds) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const hasPopupData = (response) =>
  !!response && !response.error && !!response.rule && !!response.setting;

const canInjectIntoTab = (tab) =>
  Number.isInteger(tab?.id) && /^(https?|file):/i.test(tab?.url || "");

async function trySend(sendMessage) {
  try {
    return await sendMessage();
  } catch (_error) {
    return undefined;
  }
}

export async function loadPopupData({
  sendMessage = () => sendTabMsg(MSG_TRANS_GETRULE),
  getTab = getCurTab,
  executeScript = (details) => browser?.scripting?.executeScript(details),
  wait = sleep,
} = {}) {
  let response = await trySend(sendMessage);
  if (hasPopupData(response)) return response;

  await wait(80);
  response = await trySend(sendMessage);
  if (hasPopupData(response)) return response;

  let tab;
  try {
    tab = await getTab();
  } catch (_error) {}

  if (!canInjectIntoTab(tab)) return response;

  try {
    const injection = executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["content.js"],
    });
    if (!injection) return response;
    await injection;
  } catch (_error) {
    return response;
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await wait(100);
    response = await trySend(sendMessage);
    if (hasPopupData(response)) return response;
  }

  return response;
}
