const mockSendTopFrameMsg = jest.fn();
const mockSendTabMsg = jest.fn();

jest.mock("../../libs/msg", () => ({
  sendTopFrameMsg: (...args) => mockSendTopFrameMsg(...args),
  sendTabMsg: (...args) => mockSendTabMsg(...args),
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
    mockSendTabMsg.mockReset();
  });

  test("loads data from the top frame", async () => {
    mockSendTopFrameMsg.mockResolvedValue(popupData);

    await expect(loadPopupData()).resolves.toBe(popupData);

    expect(mockSendTopFrameMsg).toHaveBeenCalledWith(MSG_TRANS_GETRULE);
    expect(mockSendTopFrameMsg).toHaveBeenCalledTimes(1);
    expect(mockSendTabMsg).not.toHaveBeenCalled();
  });

  test("returns immediately when the content script is responsive", async () => {
    const sendMessage = jest.fn().mockResolvedValue(popupData);
    const wait = jest.fn();

    await expect(loadPopupData({ sendMessage, wait })).resolves.toBe(popupData);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  test("retries once while the content script initializes", async () => {
    const sendMessage = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(popupData);
    const wait = jest.fn().mockResolvedValue(undefined);

    await expect(loadPopupData({ sendMessage, wait })).resolves.toBe(popupData);

    expect(wait).toHaveBeenCalledWith(80);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(mockSendTabMsg).not.toHaveBeenCalled();
  });

  test("loads an enabled child frame only after both top-frame attempts fail", async () => {
    mockSendTopFrameMsg.mockResolvedValue(undefined);
    mockSendTabMsg.mockResolvedValue(popupData);
    const wait = jest.fn().mockResolvedValue(undefined);

    await expect(loadPopupData({ wait })).resolves.toBe(popupData);

    expect(mockSendTopFrameMsg).toHaveBeenCalledTimes(2);
    expect(mockSendTabMsg).toHaveBeenCalledTimes(1);
    expect(mockSendTabMsg).toHaveBeenCalledWith(MSG_TRANS_GETRULE);
    expect(mockSendTabMsg.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockSendTopFrameMsg.mock.invocationCallOrder[1]
    );
  });

  test("stops after the fallback when no frame has a receiver", async () => {
    const sendMessage = jest.fn().mockRejectedValue(new Error("No receiver"));
    const sendFallbackMessage = jest
      .fn()
      .mockRejectedValue(new Error("No receiver"));
    const wait = jest.fn().mockResolvedValue(undefined);

    await expect(
      loadPopupData({ sendMessage, sendFallbackMessage, wait })
    ).resolves.toBeUndefined();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendFallbackMessage).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  test("retries incomplete data and preserves the final error response", async () => {
    const errorResponse = { error: "Page unavailable" };
    const sendMessage = jest
      .fn()
      .mockResolvedValueOnce({ rule: {} })
      .mockResolvedValueOnce(errorResponse);

    await expect(loadPopupData({ sendMessage, wait: jest.fn() })).resolves.toBe(
      errorResponse
    );
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(mockSendTabMsg).not.toHaveBeenCalled();
  });

  test("does not accept incomplete child-frame data", async () => {
    mockSendTopFrameMsg.mockResolvedValue(undefined);
    mockSendTabMsg.mockResolvedValue({ rule: {} });

    await expect(loadPopupData({ wait: jest.fn() })).resolves.toBeUndefined();
  });
});
