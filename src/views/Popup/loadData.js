import { MSG_TRANS_GETRULE } from "../../config";
import { sendTabMsg, sendTopFrameMsg } from "../../libs/msg";
import { isCurrentPopupDocument } from "../../libs/popupDocument";

const sleep = (milliseconds) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const hasPopupData = (response) =>
  !!response && !response.error && !!response.rule && !!response.setting;

const withFrameSource = (response, isTopFrame) =>
  hasPopupData(response) && response.isTopFrame === undefined
    ? { ...response, isTopFrame }
    : response;

const sendQuery = (tabId, topFrame) =>
  topFrame
    ? sendTopFrameMsg(MSG_TRANS_GETRULE, undefined, tabId)
    : sendTabMsg(MSG_TRANS_GETRULE, undefined, undefined, tabId);

async function trySend(sendMessage) {
  try {
    return await sendMessage();
  } catch (_error) {
    return undefined;
  }
}

async function resolvePopupData(response, sendFallbackMessage) {
  if (response != null) return withFrameSource(response, true);

  // A blocked top-level page can still contain an enabled child frame.
  // Prefer the top frame whenever it responds, including explicit errors.
  const fallback = await trySend(sendFallbackMessage);
  return hasPopupData(fallback) ? withFrameSource(fallback, false) : response;
}

export async function queryPopupData(tabId, documentInfo) {
  if (documentInfo) {
    const response = await trySend(() =>
      sendTabMsg(
        MSG_TRANS_GETRULE,
        undefined,
        { frameId: documentInfo.frameId },
        tabId,
        documentInfo.token
      )
    );
    if (response?.code === "STALE_DOCUMENT") return undefined;
    if (response?.error) return response;
    return hasPopupData(response) &&
      response.document?.token === documentInfo.token &&
      (await isCurrentPopupDocument(tabId, documentInfo))
      ? withFrameSource(response, documentInfo.frameId === 0)
      : undefined;
  }
  return resolvePopupData(await trySend(() => sendQuery(tabId, true)), () =>
    sendQuery(tabId, false)
  );
}

export async function loadPopupData({
  tabId,
  sendMessage = () => sendQuery(tabId, true),
  sendFallbackMessage = () => sendQuery(tabId, false),
  wait = sleep,
} = {}) {
  const verify = async (response) => {
    if (!hasPopupData(response)) return response;
    return (await isCurrentPopupDocument(tabId, response.document))
      ? response
      : undefined;
  };
  let response = await verify(await trySend(sendMessage));
  if (hasPopupData(response)) return withFrameSource(response, true);

  await wait(80);
  response = await verify(await trySend(sendMessage));
  return resolvePopupData(response, async () =>
    verify(await sendFallbackMessage())
  );
}
