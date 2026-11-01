import { checkScreenshotSupport } from "./screenshotSupport";
import { sendBgMsg } from "../msg";
jest.mock("../msg", () => ({ sendBgMsg: jest.fn() }));
const i18n = (_key, fallback) => fallback;
beforeEach(() => {
  window.alert = jest.fn();
  sendBgMsg.mockReset();
});
test.each([true, false])("support: %s", async (supported) => {
  sendBgMsg.mockResolvedValue({ supported });
  expect(await checkScreenshotSupport(i18n)).toBe(supported);
  expect(sendBgMsg).toHaveBeenCalledWith("screenshot_support");
  expect(window.alert).toHaveBeenCalledTimes(supported ? 0 : 1);
});
test("transport failure is retryable", async () => {
  sendBgMsg
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ supported: true });
  expect(await checkScreenshotSupport(i18n)).toBe(false);
  expect(window.alert).toHaveBeenCalledWith("无法检测截图能力，请重试");
  expect(await checkScreenshotSupport(i18n)).toBe(true);
});
test("invalid response is a detection failure", async () => {
  sendBgMsg.mockResolvedValue(undefined);
  expect(await checkScreenshotSupport(i18n)).toBe(false);
  expect(window.alert).toHaveBeenCalledWith("无法检测截图能力，请重试");
});
