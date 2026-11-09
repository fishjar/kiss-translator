import { afterEach, expect, it, vi } from "vitest";
import { ChromiumOffscreenHost } from "../../runtime/runtimeHostAdapter";
import { OcrClient } from "../ocrClient";
import { VlmClient } from "../vlmClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup() {
  const channel = {
    postMessage: vi.fn(),
    onmessage: null as any,
    close: vi.fn(),
  };
  const host = new ChromiumOffscreenHost({
    channelFactory: () => channel as any,
    ensureOffscreenFn: async () => {},
  });
  const ensure = vi.spyOn(host as any, "ensure");
  return { channel, host, ensure };
}

it("host preparation consumes the RPC budget and progress cannot renew a strict deadline", async () => {
  vi.useFakeTimers();
  const { channel, host, ensure } = setup();
  ensure.mockImplementation(async () => {
    vi.advanceTimersByTime(20000);
  });
  const pending = host.request({
    id: "budget",
    service: "asr",
    method: "transcribe",
    payload: {},
    deadlineMs: 600000,
  });
  const failure = pending.catch((error) => error);
  await Promise.resolve();
  await Promise.resolve();
  const request = channel.postMessage.mock.calls.find(
    ([value]) => value.kind === "request"
  )![0].request;
  expect(request.deadlineMs).toBe(580000);
  vi.advanceTimersByTime(300000);
  channel.onmessage({
    data: { kind: "progress", progress: { id: "budget", status: "working" } },
  });
  expect(host.getPendingCount()).toBe(1);
  vi.advanceTimersByTime(280000);
  expect((await failure).message).toContain("REQUEST_TIMEOUT");
  expect(host.getPendingCount()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["cancel", "expired"])(
  "host preparation never dispatches an already %s request",
  async (mode) => {
    vi.useFakeTimers();
    const { channel, host, ensure } = setup();
    const controller = new AbortController();
    ensure.mockImplementation(async () => {
      if (mode === "cancel") controller.abort();
      else vi.advanceTimersByTime(120000);
    });
    await expect(
      host.request(
        {
          id: "expired",
          service: "asr",
          method: "transcribe",
          payload: {},
          deadlineMs: 120000,
        },
        { signal: controller.signal }
      )
    ).rejects.toThrow(
      mode === "cancel" ? "REQUEST_CANCELLED" : "REQUEST_TIMEOUT"
    );
    expect(channel.postMessage).not.toHaveBeenCalled();
    expect(host.getPendingCount()).toBe(0);
  }
);

it("OCR and VLM pass their configured deadline into RPC without the built-in 120/300-second cap", async () => {
  vi.useFakeTimers();
  const host = {
    onServiceState: () => () => {},
    request: vi.fn(async () => ({ text: "ok", items: [] })),
  };
  const deadlineAt = Date.now() + 500000;
  await new OcrClient(host as any).recognize(
    new Blob(),
    undefined,
    { modelRef: "ocr" },
    undefined,
    deadlineAt
  );
  expect(host.request.mock.calls.at(-1)![0].deadlineMs).toBe(500000);
  await new VlmClient(host as any).chat(
    [{ role: "user", content: "hello", images: [new ArrayBuffer(1)] }],
    10,
    () => {},
    [],
    { modelRef: "vlm" },
    undefined,
    { deadlineAt }
  );
  expect(host.request.mock.calls.at(-1)![0].deadlineMs).toBe(500000);
});
