import {
  localAiRequest,
  cancelLocalAiRequest,
  localAiSettings,
  localAiHost,
} from "./localAiBackground";

describe("local AI settings bridge", () => {
  let originalChrome;
  beforeEach(() => {
    originalChrome = global.chrome;
    global.chrome = { storage: { local: { get: jest.fn(), set: jest.fn() } } };
  });
  afterEach(() => {
    global.chrome = originalChrome;
  });
  test("reads and writes only the shared local AI settings key", async () => {
    global.chrome.storage.local.get.mockResolvedValue({
      "kiss-ai-settings": { residentMemoryBudgetMB: 4096 },
    });
    expect(await localAiSettings({ action: "get" })).toEqual({
      "kiss-ai-settings": { residentMemoryBudgetMB: 4096 },
    });
    const value = { residentMemoryBudgetMB: 2048 };
    await localAiSettings({ action: "set", value });
    expect(global.chrome.storage.local.get).toHaveBeenCalledWith(
      "kiss-ai-settings"
    );
    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
      "kiss-ai-settings": value,
    });
  });
  test("propagates persistence failure and rejects unsupported actions", async () => {
    global.chrome.storage.local.set.mockRejectedValue(Error("storage failed"));
    await expect(localAiSettings({ action: "set", value: {} })).rejects.toThrow(
      "storage failed"
    );
    await expect(localAiSettings({ action: "delete" })).rejects.toThrow(
      "Unsupported"
    );
  });
  test("creates and closes the shared host through the background protocol", async () => {
    global.chrome.runtime = {
      getURL: (path) => `chrome-extension://test/${path}`,
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
      getContexts: jest.fn().mockResolvedValue([]),
    };
    global.chrome.offscreen = {
      Reason: { WORKERS: "WORKERS" },
      createDocument: jest.fn(),
      closeDocument: jest.fn(),
    };
    await localAiHost({ action: "ensure" });
    expect(global.chrome.offscreen.createDocument).toHaveBeenCalledTimes(1);
    global.chrome.runtime.getContexts.mockResolvedValue([{}]);
    await localAiHost({ action: "close" });
    expect(global.chrome.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    global.chrome.runtime.getContexts.mockResolvedValue([]);
    await localAiHost({ action: "close" });
    expect(global.chrome.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    await expect(localAiHost({ action: "other" })).rejects.toThrow(
      "Unsupported"
    );
  });
});

describe("localAiBackground", () => {
  let mockChannels = [];
  let originalBroadcastChannel;

  beforeEach(() => {
    mockChannels = [];
    originalBroadcastChannel = global.BroadcastChannel;

    global.BroadcastChannel = class MockBroadcastChannel {
      constructor(name) {
        this.name = name;
        this.onmessage = null;
        this.closed = false;
        mockChannels.push(this);
      }
      postMessage(data) {
        this.lastMessage = data;
        // 自动响应 ping
        if (data?.kind === "ping") {
          queueMicrotask(() => {
            if (!this.closed && this.onmessage) {
              this.onmessage({ data: { kind: "pong", id: data.id } });
            }
          });
        }
      }
      close() {
        this.closed = true;
      }
    };
  });

  afterEach(() => {
    global.BroadcastChannel = originalBroadcastChannel;
    jest.useRealTimers();
  });

  test("cancelLocalAiRequest 向 BroadcastChannel 发送带取消原因的消息", () => {
    cancelLocalAiRequest("req-123", "REQUEST_CANCELLED: 测试取消");
    const channel = mockChannels[mockChannels.length - 1];
    expect(channel.lastMessage).toEqual({
      kind: "cancel",
      id: "req-123",
      reason: "REQUEST_CANCELLED: 测试取消",
    });
    expect(channel.closed).toBe(true);
  });

  test("localAiRequest 超时后向运行时发送 cancel 消息", async () => {
    jest.useFakeTimers();

    const requestPromise = localAiRequest({ id: "req-timeout-test" });

    // 推进微任务以完成 ping 握手
    for (let i = 0; i < 5; i++) {
      jest.advanceTimersByTime(10);
      await Promise.resolve();
    }

    // 快进 300,000ms 触发 request 超时
    jest.advanceTimersByTime(300000);
    await Promise.resolve();

    await expect(requestPromise).rejects.toThrow("Local AI runtime timed out");

    // 验证有 channel 发送了 cancel 消息
    const cancelMsg = mockChannels.find(
      (c) =>
        c.lastMessage?.kind === "cancel" &&
        c.lastMessage?.id === "req-timeout-test"
    );
    expect(cancelMsg).toBeDefined();
    expect(cancelMsg.lastMessage.reason).toBe(
      "REQUEST_TIMEOUT: 本地 AI 运行时超时已取消"
    );
  });
});
