const mockSendTopFrameMsg = jest.fn();

jest.mock("../../libs/msg", () => ({
  getCurTab: jest.fn(),
  sendTopFrameMsg: (...args) => mockSendTopFrameMsg(...args),
}));

const { MSG_TRANS_GETRULE } = require("../../config");
const { loadPopupData } = require("./loadData");

const popupData = {
  rule: { transOpen: "false" },
  setting: { darkMode: "auto" },
};

describe("loadPopupData", () => {
  beforeEach(() => {
    mockSendTopFrameMsg.mockReset();
  });

  test("uses only the top-frame response for the default readiness probe", async () => {
    mockSendTopFrameMsg.mockResolvedValue(popupData);
    const executeScript = jest.fn();

    await expect(
      loadPopupData({ executeScript, wait: jest.fn() })
    ).resolves.toBe(popupData);

    expect(mockSendTopFrameMsg).toHaveBeenCalledWith(MSG_TRANS_GETRULE);
    expect(executeScript).not.toHaveBeenCalled();
  });

  test("returns immediately when the content script is already responsive", async () => {
    const sendMessage = jest.fn().mockResolvedValue(popupData);
    const executeScript = jest.fn();

    await expect(
      loadPopupData({ sendMessage, executeScript, wait: jest.fn() })
    ).resolves.toBe(popupData);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(executeScript).not.toHaveBeenCalled();
  });

  test("injects content.js and retries when an open tab lost its receiver", async () => {
    const sendMessage = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(popupData);
    const executeScript = jest.fn().mockResolvedValue(undefined);
    const waitMock = jest.fn().mockResolvedValue(undefined);

    await expect(
      loadPopupData({
        sendMessage,
        getTab: jest.fn().mockResolvedValue({
          id: 17,
          url: "https://example.com/article",
        }),
        executeScript,
        wait: waitMock,
      })
    ).resolves.toBe(popupData);

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 17, allFrames: true },
      files: ["content.js"],
    });
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  test("does not inject scripts into browser or extension pages", async () => {
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    const executeScript = jest.fn();

    await expect(
      loadPopupData({
        sendMessage,
        getTab: jest.fn().mockResolvedValue({
          id: 18,
          url: "safari-web-extension://example/options.html",
        }),
        executeScript,
        wait: jest.fn().mockResolvedValue(undefined),
      })
    ).resolves.toBeUndefined();

    expect(executeScript).not.toHaveBeenCalled();
  });

  test("finishes the normal retry sequence when content remains unavailable", async () => {
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    const executeScript = jest.fn().mockResolvedValue(undefined);
    const waitMock = jest.fn().mockResolvedValue(undefined);

    await expect(
      loadPopupData({
        sendMessage,
        getTab: jest.fn().mockResolvedValue({
          id: 19,
          url: "https://example.com/article",
        }),
        executeScript,
        wait: waitMock,
      })
    ).resolves.toBeUndefined();

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 19, allFrames: true },
      files: ["content.js"],
    });
    expect(sendMessage).toHaveBeenCalledTimes(8);
    expect(waitMock).toHaveBeenCalledTimes(7);
  });
});
