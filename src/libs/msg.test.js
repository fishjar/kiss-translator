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
    await sendTopFrameMsg("get-rule");

    expect(mockSendMessage).toHaveBeenCalledWith(
      17,
      { action: "get-rule", args: undefined },
      { frameId: 0 }
    );
  });
});
