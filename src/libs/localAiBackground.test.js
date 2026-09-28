import { localAiRequest, cancelLocalAiRequest } from "./localAiBackground";

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
