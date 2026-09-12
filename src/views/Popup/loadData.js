import { MSG_TRANS_GETRULE } from "../../config";
import { sendTabMsg, sendTopFrameMsg } from "../../libs/msg";

const sleep = (milliseconds) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const hasPopupData = (response) =>
  !!response && !response.error && !!response.rule && !!response.setting;

async function trySend(sendMessage) {
  try {
    return await sendMessage();
  } catch (_error) {
    return undefined;
  }
}

async function resolvePopupData(
  response,
  sendFallbackMessage = () => sendTabMsg(MSG_TRANS_GETRULE)
) {
  if (response != null) return response;

  // A blocked top-level page can still contain an enabled child frame.
  // Prefer the top frame whenever it responds, including explicit errors.
  const fallback = await trySend(sendFallbackMessage);
  return hasPopupData(fallback) ? fallback : response;
}

export async function queryPopupData() {
  return resolvePopupData(
    await trySend(() => sendTopFrameMsg(MSG_TRANS_GETRULE))
  );
}

export async function loadPopupData({
  sendMessage = () => sendTopFrameMsg(MSG_TRANS_GETRULE),
  sendFallbackMessage = () => sendTabMsg(MSG_TRANS_GETRULE),
  wait = sleep,
} = {}) {
  let response = await trySend(sendMessage);
  if (hasPopupData(response)) return response;

  await wait(80);
  response = await trySend(sendMessage);
  return resolvePopupData(response, sendFallbackMessage);
}
