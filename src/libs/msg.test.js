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

  test.each([0, 12])(
    "authorizes a broadcast in frame %s before forwarding to the other documents",
    async (frameId) => {
      let authorize;
      const selectedResponse = {
        document: { token: "displayed-document", frameId },
        rule: { transOpen: "true" },
      };
      mockSendMessage.mockImplementationOnce(
        () => new Promise((resolve) => (authorize = resolve))
      );
      const result = sendTabMsg(
        "toggle",
        { enabled: true },
        undefined,
        29,
        undefined,
        "displayed-document"
      );
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenNthCalledWith(1, 29, {
        action: "toggle",
        args: { enabled: true },
        responseDocumentToken: "displayed-document",
      });
      authorize(selectedResponse);
      await expect(result).resolves.toBe(selectedResponse);
      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenNthCalledWith(2, 29, {
        action: "toggle",
        args: { enabled: true },
        sourceDocument: selectedResponse.document,
      });
    }
  );

  test.each([
    undefined,
    { error: "Paused while editing." },
    { document: { token: "replacement-document", frameId: 0 } },
    { document: { token: "displayed-document" } },
  ])(
    "does not forward a command without authorization: %j",
    async (response) => {
      mockSendMessage.mockResolvedValue(response);
      await expect(
        sendTabMsg(
          "toggle",
          { enabled: true },
          undefined,
          29,
          undefined,
          "displayed-document"
        )
      ).resolves.toBe(response);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    }
  );

  test("preserves the selected response when optional recipients disappear", async () => {
    const response = { document: { token: "displayed-document", frameId: 0 } };
    mockSendMessage
      .mockResolvedValueOnce(response)
      .mockRejectedValueOnce(new Error("The message port closed."));
    await expect(
      sendTabMsg(
        "toggle",
        undefined,
        undefined,
        29,
        undefined,
        "displayed-document"
      )
    ).resolves.toBe(response);
  });
});
