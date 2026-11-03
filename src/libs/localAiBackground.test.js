import {
  localAiRequest,
  cancelLocalAiRequest,
  localAiSettings,
  localAiHost,
} from "./localAiBackground";
import { acquireProviderHost } from "../providers/hostLease";

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
  test("a Provider arriving during a close vetoes teardown and still obtains the existing host", async () => {
    let answer;
    const contexts = new Promise((resolve) => {
      answer = resolve;
    });
    global.chrome.runtime = {
      getURL: (path) => `chrome-extension://test/${path}`,
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
      getContexts: jest
        .fn()
        .mockImplementationOnce(() => contexts)
        .mockResolvedValue([{}]),
    };
    global.chrome.offscreen = {
      createDocument: jest.fn(),
      closeDocument: jest.fn(),
      Reason: { WORKERS: "WORKERS" },
    };
    const closing = localAiHost({ action: "close" });
    await Promise.resolve();
    const release = acquireProviderHost();
    try {
      const ensuring = localAiHost({ action: "ensure" });
      answer([{}]);
      await expect(closing).rejects.toMatchObject({ code: "HOST_BUSY" });
      await expect(ensuring).resolves.toEqual({});
      expect(global.chrome.offscreen.closeDocument).not.toHaveBeenCalled();
      expect(global.chrome.offscreen.createDocument).not.toHaveBeenCalled();
    } finally {
      release();
    }
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
  test("routes only matching token events and releases the channel after cancellation", async () => {
    const abort = new AbortController(),
      onStream = jest.fn();
    const pending = localAiRequest(
      { id: "stream-cancel" },
      { signal: abort.signal, onStream }
    );
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    const channel = mockChannels.find((c) => c.lastMessage?.kind === "request");
    expect(channel).toBeDefined();
    channel.onmessage({
      data: {
        kind: "stream",
        stream: { id: "other", type: "token", text: "ignore" },
      },
    });
    channel.onmessage({
      data: {
        kind: "stream",
        stream: { id: "stream-cancel", type: "token", text: "hello" },
      },
    });
    expect(onStream).toHaveBeenCalledTimes(1);
    abort.abort();
    await rejected;
    expect(channel.closed).toBe(true);
    expect(
      mockChannels.some(
        (c) =>
          c.lastMessage?.kind === "cancel" &&
          c.lastMessage.id === "stream-cancel"
      )
    ).toBe(true);
  });
});
