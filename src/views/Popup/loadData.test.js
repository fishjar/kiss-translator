const mockSendTopFrameMsg = jest.fn();
const mockSendTabMsg = jest.fn();
const mockIsCurrentPopupDocument = jest.fn();

jest.mock("../../libs/popupDocument", () => ({
  isCurrentPopupDocument: (...args) => mockIsCurrentPopupDocument(...args),
}));

jest.mock("../../libs/msg", () => ({
  sendTopFrameMsg: (...args) => mockSendTopFrameMsg(...args),
  sendTabMsg: (...args) => mockSendTabMsg(...args),
}));

const { MSG_TRANS_GETRULE } = require("../../config");
const { loadPopupData, queryPopupData } = require("./loadData");

const popupData = {
  rule: { transOpen: "false" },
  setting: { darkMode: "auto" },
  isTopFrame: true,
};

describe("loadPopupData", () => {
  beforeEach(() => {
    mockSendTopFrameMsg.mockReset();
    mockSendTabMsg.mockReset();
    mockIsCurrentPopupDocument.mockReset().mockResolvedValue(true);
  });

  test("loads data from the top frame", async () => {
    mockSendTopFrameMsg.mockResolvedValue(popupData);

    await expect(loadPopupData()).resolves.toBe(popupData);

    expect(mockSendTopFrameMsg).toHaveBeenCalledWith(
      MSG_TRANS_GETRULE,
      undefined,
      undefined
    );
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

  test("does not replace the page session with an arbitrary child response", async () => {
    mockSendTopFrameMsg.mockResolvedValue(undefined);
    mockSendTabMsg.mockResolvedValue({ ...popupData, isTopFrame: false });
    await expect(loadPopupData({ wait: jest.fn() })).resolves.toBeUndefined();
    expect(mockSendTopFrameMsg).toHaveBeenCalledTimes(2);
    expect(mockSendTabMsg).not.toHaveBeenCalled();
  });

  test("stops after the top-frame retry when no receiver exists", async () => {
    const sendMessage = jest.fn().mockRejectedValue(new Error("No receiver"));
    const sendFallbackMessage = jest
      .fn()
      .mockRejectedValue(new Error("No receiver"));
    const wait = jest.fn().mockResolvedValue(undefined);

    await expect(
      loadPopupData({ sendMessage, sendFallbackMessage, wait })
    ).resolves.toBeUndefined();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendFallbackMessage).not.toHaveBeenCalled();
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

  test("keeps queries attached to the captured tab without child fallback", async () => {
    mockSendTopFrameMsg.mockResolvedValue(undefined);
    await expect(
      loadPopupData({ tabId: 42, wait: jest.fn() })
    ).resolves.toBeUndefined();
    expect(mockSendTopFrameMsg).toHaveBeenCalledWith(
      MSG_TRANS_GETRULE,
      undefined,
      42
    );
    expect(mockSendTabMsg).not.toHaveBeenCalled();
  });

  test("rejects complete snapshots from replaced or unverifiable documents", async () => {
    mockSendTopFrameMsg.mockResolvedValue(popupData);
    mockIsCurrentPopupDocument.mockResolvedValue(false);
    await expect(
      loadPopupData({ tabId: 17, wait: jest.fn() })
    ).resolves.toBeUndefined();
    expect(mockSendTopFrameMsg).toHaveBeenCalledTimes(2);
  });

  test("does not validate or select unrelated child snapshots", async () => {
    mockSendTopFrameMsg.mockResolvedValue(undefined);
    mockSendTabMsg.mockResolvedValue({
      ...popupData,
      document: { token: "child", frameId: 7 },
    });
    await expect(
      loadPopupData({ tabId: 17, wait: jest.fn() })
    ).resolves.toBeUndefined();
    expect(mockIsCurrentPopupDocument).not.toHaveBeenCalled();
  });

  test("confirms an action only against its captured document and frame", async () => {
    const document = { token: "captured-document", frameId: 7 };
    const response = { ...popupData, document, isTopFrame: false };
    mockSendTabMsg.mockResolvedValue(response);
    await expect(queryPopupData(17, document)).resolves.toBe(response);
    expect(mockSendTabMsg).toHaveBeenCalledWith(
      MSG_TRANS_GETRULE,
      undefined,
      { frameId: 7 },
      17,
      "captured-document"
    );
    expect(mockSendTopFrameMsg).not.toHaveBeenCalled();
    mockSendTabMsg.mockResolvedValue({
      ...response,
      document: { ...document, token: "replacement" },
    });
    await expect(queryPopupData(17, document)).resolves.toBeUndefined();
  });

  test("invalidates a replaced receiver while preserving ordinary action errors", async () => {
    const document = { token: "old", frameId: 7 };
    mockSendTabMsg.mockResolvedValue({
      error: "Document changed",
      code: "STALE_DOCUMENT",
    });
    await expect(queryPopupData(17, document)).resolves.toBeUndefined();
    const paused = { error: "The rule editor is open" };
    mockSendTabMsg.mockResolvedValue(paused);
    await expect(queryPopupData(17, document)).resolves.toBe(paused);
  });
});
