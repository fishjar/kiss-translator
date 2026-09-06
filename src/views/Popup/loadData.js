import { MSG_TRANS_GETRULE } from "../../config";
import { sendTopFrameMsg } from "../../libs/msg";

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

export async function loadPopupData({
  sendMessage = () => sendTopFrameMsg(MSG_TRANS_GETRULE),
  wait = sleep,
} = {}) {
  let response = await trySend(sendMessage);
  if (hasPopupData(response)) return response;

  await wait(80);
  response = await trySend(sendMessage);
  return response;
}
