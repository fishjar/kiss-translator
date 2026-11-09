import { sendBgMsg } from "../msg";
import { MSG_SCREENSHOT_SUPPORT } from "../../config/msg";

export async function checkScreenshotSupport(i18n) {
  let response;
  try {
    response = await sendBgMsg(MSG_SCREENSHOT_SUPPORT);
    if (typeof response?.supported !== "boolean")
      throw new Error("Invalid screenshot support response");
  } catch {
    alert(i18n("image_screenshot_check_failed", "无法检测截图能力，请重试"));
    return false;
  }
  if (!response.supported) {
    alert(i18n("image_screenshot_unsupported", "当前浏览器不支持截图翻译"));
    return false;
  }
  return true;
}
