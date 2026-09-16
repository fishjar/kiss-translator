const mockQuery = jest.fn();
const mockSendMessage = jest.fn();

jest.mock("./browser", () => ({
  browser: {
    tabs: {
      query: (...args) => mockQuery(...args),
      sendMessage: (...args) => mockSendMessage(...args),
    },
  },
}));

const { sendTabMsg, sendTopFrameMsg } = require("./msg");

describe("tab messaging targets", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([{ id: 17 }]);
    mockSendMessage.mockReset();
    mockSendMessage.mockResolvedValue({ ok: true });
  });

  test("broadcasts ordinary tab messages with the existing behavior", async () => {
    await sendTabMsg("toggle", { enabled: true });

    expect(mockSendMessage).toHaveBeenCalledWith(17, {
      action: "toggle",
      args: { enabled: true },
    });
  });

  test("targets frame zero when a top-frame response is required", async () => {
    await expect(sendTopFrameMsg("get-rule")).resolves.toEqual({ ok: true });

    expect(mockSendMessage).toHaveBeenCalledWith(
      17,
      { action: "get-rule", args: undefined },
      { frameId: 0 }
    );
  });

  test("keeps broadcasts on the tab whose controls initiated the action", async () => {
    await sendTabMsg("toggle", { enabled: true }, undefined, 29);

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(29, {
      action: "toggle",
      args: { enabled: true },
    });
  });

  test("uses the explicit tab and top frame without consulting active tabs", async () => {
    await sendTopFrameMsg("get-rule", undefined, 0);

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(
      0,
      { action: "get-rule", args: undefined },
      { frameId: 0 }
    );
  });

  test("carries a document guard only when requested by a frame-specific caller", async () => {
    await sendTopFrameMsg("edit", undefined, 17, "captured-document");
    expect(mockSendMessage).toHaveBeenCalledWith(
      17,
      {
        action: "edit",
        args: undefined,
        expectedDocumentToken: "captured-document",
      },
      { frameId: 0 }
    );
    mockSendMessage.mockClear();
    await sendTabMsg("toggle", { enabled: true }, undefined, 17);
    expect(mockSendMessage.mock.calls[0][1]).not.toHaveProperty(
      "expectedDocumentToken"
    );
  });

  test("selects a broadcast response without restricting command execution", async () => {
    await sendTabMsg(
      "toggle",
      { enabled: true },
      undefined,
      29,
      undefined,
      "displayed-document"
    );

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(29, {
      action: "toggle",
      args: { enabled: true },
      responseDocumentToken: "displayed-document",
    });
  });
});
