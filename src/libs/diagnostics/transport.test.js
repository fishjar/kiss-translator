import { TextEncoder } from "util";
jest.mock("../browser", () => ({
  browser: { runtime: { id: "test", sendMessage: jest.fn() } },
}));
let transport, send;
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  process.env.REACT_APP_CLIENT = "chrome";
  global.TextEncoder = TextEncoder;
  global.browser = require("../browser").browser;
  transport = require("./transport");
  send = require("../browser").browser.runtime.sendMessage;
  send.mockResolvedValue({ ok: true });
});
afterEach(() => {
  transport.setDiagnosticSink(undefined);
  jest.clearAllTimers();
  jest.useRealTimers();
  delete process.env.REACT_APP_CLIENT;
  delete global.browser;
});

test("batches ordinary events but submits warnings immediately", async () => {
  transport.captureDiagnostic({ level: "debug", event: "start" });
  expect(send).not.toHaveBeenCalled();
  transport.captureDiagnostic({ level: "warn", event: "fallback" });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].args.records.map((r) => r.level)).toEqual([
    "debug",
    "warn",
  ]);
  await tick();
});

test("bounds pending events under a blocked sender and reports overflow", async () => {
  let release;
  send.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    })
  );
  transport.captureDiagnostic({ level: "error", event: "first" });
  for (let n = 0; n < 500; n++)
    transport.captureDiagnostic({ level: "debug", event: "progress" });
  release({ ok: true });
  await tick();
  jest.runOnlyPendingTimers();
  await tick();
  expect(send.mock.calls[1][0].args).toMatchObject({ dropped: 300 });
  expect(send.mock.calls[1][0].args.records).toHaveLength(50);
});

test("transport failures do not reject callers and are counted on recovery", async () => {
  send.mockRejectedValueOnce(new Error("disconnected"));
  expect(() =>
    transport.captureDiagnostic({ level: "error", event: "failed" })
  ).not.toThrow();
  await tick();
  transport.captureDiagnostic({ level: "warn", event: "retry" });
  await tick();
  expect(send.mock.calls[1][0].args.dropped).toBe(1);
});

test("Web and userscript builds do not send extension diagnostics", () => {
  for (const client of ["web", "userscript"]) {
    jest.resetModules();
    process.env.REACT_APP_CLIENT = client;
    global.browser = require("../browser").browser;
    const capture = require("./transport").captureDiagnostic;
    const request = require("../browser").browser.runtime.sendMessage;
    capture({ level: "error", event: "test" });
    expect(request).not.toHaveBeenCalled();
  }
});
