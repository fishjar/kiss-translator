const mockSendTopFrameMsg = jest.fn();

jest.mock("../../libs/msg", () => ({
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

  test("loads data from the top frame", async () => {
    mockSendTopFrameMsg.mockResolvedValue(popupData);

    await expect(loadPopupData()).resolves.toBe(popupData);

    expect(mockSendTopFrameMsg).toHaveBeenCalledWith(MSG_TRANS_GETRULE);
    expect(mockSendTopFrameMsg).toHaveBeenCalledTimes(1);
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
  });

  test("stops after one retry when no receiver is available", async () => {
    const sendMessage = jest.fn().mockRejectedValue(new Error("No receiver"));
    const wait = jest.fn().mockResolvedValue(undefined);

    await expect(loadPopupData({ sendMessage, wait })).resolves.toBeUndefined();

    expect(sendMessage).toHaveBeenCalledTimes(2);
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
  });
});
