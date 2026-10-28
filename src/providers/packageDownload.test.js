import { zipSync, strToU8 } from "fflate";
import { downloadProviderPackage } from "./package";

const target = "https://example.invalid/plugin.zip";
const never = () => new Promise(() => {});
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
function response(read) {
  const reader = {
    read: jest.fn(read),
    cancel: jest.fn(async () => {}),
    releaseLock: jest.fn(),
  };
  return { reader, response: { ok: true, body: { getReader: () => reader } } };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("download deadline covers headers even if a transport ignores abort", async () => {
  const fetchImpl = jest.fn(never);
  const result = downloadProviderPackage(target, fetchImpl, { timeoutMs: 50 });
  const rejected = expect(result).rejects.toMatchObject({
    code: "REQUEST_TIMEOUT",
  });
  jest.advanceTimersByTime(50);
  await rejected;
  expect(fetchImpl.mock.calls[0][1]).toMatchObject({
    credentials: "omit",
    redirect: "error",
  });
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test("cancel a stalled body and release the reader without waiting for its transport", async () => {
  const transport = response(never);
  const controller = new AbortController();
  const result = downloadProviderPackage(
    target,
    async () => transport.response,
    { signal: controller.signal }
  );
  const rejected = expect(result).rejects.toMatchObject({
    code: "REQUEST_CANCELLED",
  });
  await flush();
  expect(transport.reader.read).toHaveBeenCalledTimes(1);
  controller.abort();
  await rejected;
  expect(transport.reader.cancel).toHaveBeenCalledTimes(1);
  expect(transport.reader.releaseLock).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test("already cancelled downloads never send a request; body size limit releases the reader", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetchImpl = jest.fn();
  await expect(
    downloadProviderPackage(target, fetchImpl, { signal: controller.signal })
  ).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
  expect(fetchImpl).not.toHaveBeenCalled();
  const transport = response(async () => ({
    value: new Uint8Array(5 * 1024 * 1024 + 1),
    done: false,
  }));
  await expect(
    downloadProviderPackage(target, async () => transport.response)
  ).rejects.toMatchObject({ code: "PACKAGE_TOO_LARGE" });
  expect(transport.reader.releaseLock).toHaveBeenCalledTimes(1);
});

test("successful download still validates the package and preserves its source index", async () => {
  const bytes = zipSync({
    "manifest.json": strToU8(
      JSON.stringify({
        apiVersion: 1,
        id: "download-test",
        name: "test",
        version: "1.0.0",
        services: [
          {
            id: "chat",
            implementation: { kind: "script", entry: "chat.js" },
            capabilities: { chat: { handler: "chat" } },
          },
        ],
      })
    ),
    "chat.js": strToU8("exports.chat = () => ({text:'ok'});"),
  });
  let sent = false;
  const transport = response(async () =>
    sent ? { done: true } : ((sent = true), { done: false, value: bytes })
  );
  const pack = await downloadProviderPackage(
    target,
    async () => transport.response
  );
  expect(pack.manifest.id).toBe("download-test");
  expect(pack.source).toEqual({ kind: "zip", url: target });
  expect(transport.reader.releaseLock).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
