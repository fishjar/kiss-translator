jest.mock("./runtime", () => ({ invokeInstance: jest.fn() }));
jest.mock("./invocation", () => ({ createInvocation: jest.fn(() => ({})) }));
jest.mock("./transport", () => ({ createAssetStore: jest.fn(() => ({})) }));
jest.mock("./bridgeInvocation", () => ({ invokeBridgedService: jest.fn() }));
import { invokeService } from "./serviceRuntime";
import { invokeBridgedService } from "./bridgeInvocation";

test("a Chromium content script routes system playback to background even without chrome.tts", () => {
  const previousChrome = global.chrome;
  global.chrome = { runtime: { id: "extension" } };
  const expected = { requestId: "background-speech" };
  invokeBridgedService.mockReturnValue(expected);
  try {
    expect(
      invokeService({ apiSlug: "speech", apiType: "SystemTTS" }, "speak", {
        text: "hello",
      })
    ).toBe(expected);
    expect(invokeBridgedService).toHaveBeenCalledWith(
      "speech",
      "speak",
      { text: "hello" },
      expect.objectContaining({
        timeoutMs: 120000,
        deadlineAt: expect.any(Number),
      })
    );
  } finally {
    global.chrome = previousChrome;
  }
});
