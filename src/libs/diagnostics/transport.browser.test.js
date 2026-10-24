/** @jest-environment node */
import fs from "fs";
import path from "path";
import vm from "vm";
import { TextEncoder } from "util";
import { transformSync } from "@babel/core";

const compiled = new Map();
function browserWorld({
  client = "chrome",
  protocol = "https:",
  pathname = "/article",
  context = "content",
} = {}) {
  const send = jest.fn().mockResolvedValue({ ok: true });
  const timers = new Map();
  let sequence = 0;
  const global = vm.createContext({
    location: { protocol, pathname },
    __KISS_CONTEXT__: context,
    chrome: { runtime: { id: "test-extension", sendMessage: send } },
    TextEncoder,
    URL,
    console: { log() {}, info() {}, warn() {}, error() {} },
    setTimeout: (callback) => {
      const id = ++sequence;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  // Each loader models an independent Webpack/Vite bundle in the same document.
  const bundle = () => {
    const modules = new Map();
    const load = (filename) => {
      if (modules.has(filename)) return modules.get(filename);
      const exports = {};
      modules.set(filename, exports);
      const key = `${client}:${filename}`;
      if (!compiled.has(key))
        compiled.set(
          key,
          transformSync(
            fs
              .readFileSync(filename, "utf8")
              .replaceAll(
                "process.env.REACT_APP_CLIENT",
                JSON.stringify(client)
              ),
            {
              babelrc: false,
              configFile: false,
              presets: [
                [
                  require.resolve("@babel/preset-env"),
                  { targets: { node: "current" }, modules: "commonjs" },
                ],
              ],
            }
          ).code
        );
      vm.runInContext(
        `(function(exports,require){${compiled.get(key)}\n})`,
        global
      )(exports, (name) =>
        load(path.resolve(path.dirname(filename), `${name}.js`))
      );
      return exports;
    };
    return {
      transport: load(path.resolve(__dirname, "transport.js")),
      logger: load(path.resolve(__dirname, "../log.js")).logger,
    };
  };
  const settle = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  return {
    global,
    send,
    timers,
    bundle,
    settle,
    async flush() {
      await settle();
      while (timers.size) {
        const [id, callback] = timers.entries().next().value;
        timers.delete(id);
        callback();
        await settle();
      }
    },
  };
}

test.each([
  ["chrome", "https:", "/article", "content"],
  ["firefox", "https:", "/article", "content"],
  ["chrome", "chrome-extension:", "/popup.html", "popup"],
  ["chrome", "chrome-extension:", "/options.html", "options"],
  [undefined, "chrome-extension:", "/offscreen.html", "offscreen"],
])(
  "%s %s %s logger collects without a runtime process global",
  async (client, protocol, pathname, context) => {
    const world = browserWorld({
      client: client || "unconfigured-vite",
      protocol,
      pathname,
      context,
    });
    expect(vm.runInContext("typeof process", world.global)).toBe("undefined");
    const { logger } = world.bundle();
    logger.setLevel("SILENT");
    for (const level of ["debug", "info", "warn", "error"])
      logger.child("browser-test").event(level, `test.${level}`, {
        requestId: "browser-task",
        body: "PRIVATE_BODY",
      });
    await world.flush();
    const records = world.send.mock.calls.flatMap(
      ([message]) => message.args.records
    );
    expect(records.map((record) => record.level)).toEqual([
      "debug",
      "info",
      "warn",
      "error",
    ]);
    expect(records.every((record) => record.environment === context)).toBe(
      true
    );
    expect(JSON.stringify(records)).not.toContain("PRIVATE_BODY");
  }
);

test("popup submits every level before closing, without waiting for an earlier ACK", async () => {
  const world = browserWorld({
    protocol: "chrome-extension:",
    pathname: "/popup.html",
    context: undefined,
  });
  world.global.__KISS_CONTEXT__ = undefined;
  world.send.mockReturnValueOnce(new Promise(() => {}));
  const { logger } = world.bundle();
  logger.debug("first");
  logger.info("second");
  logger.warn("third");
  logger.error("fourth");
  expect(world.send).toHaveBeenCalledTimes(4);
  expect(world.timers.size).toBe(0);
  expect(
    world.send.mock.calls.map(([message]) => message.args.records[0].level)
  ).toEqual(["debug", "info", "warn", "error"]);
  await world.settle();
});

test("two Firefox bundles share the background sink and do not send to their own frame", async () => {
  const world = browserWorld({
    client: "firefox",
    protocol: "moz-extension:",
    pathname: "/local-ai-background.html",
    context: "background",
  });
  const background = world.bundle();
  const host = world.bundle();
  const store = jest.fn().mockResolvedValue({ count: 1 });
  host.logger.info("before background ready");
  background.transport.setDiagnosticSink(store);
  await world.flush();
  host.logger.error("worker failed");
  await world.flush();
  expect(store).toHaveBeenCalledTimes(2);
  expect(world.send).not.toHaveBeenCalled();
  expect(
    store.mock.calls
      .flatMap(([records]) => records)
      .map((record) => record.level)
  ).toEqual(["info", "error"]);
  // A different document still needs IPC, even when Symbol.for returns the same key.
  const other = browserWorld({
    protocol: "chrome-extension:",
    pathname: "/offscreen.html",
    context: "offscreen",
  });
  other.bundle().logger.error("other document");
  await other.flush();
  expect(other.send).toHaveBeenCalledTimes(1);
});

test.each(["web", "userscript"])(
  "%s stays console-only on a normal website",
  async (client) => {
    const world = browserWorld({ client });
    world.bundle().logger.error("console only");
    await world.flush();
    expect(world.send).not.toHaveBeenCalled();
  }
);

test("the background sink handles failures without recursive logging and reports loss on recovery", async () => {
  const world = browserWorld({
    protocol: "chrome-extension:",
    pathname: "/background.js",
    context: "background",
  });
  const { logger, transport } = world.bundle();
  const store = jest
    .fn()
    .mockRejectedValueOnce(new Error("storage failure"))
    .mockResolvedValue({ count: 1 });
  transport.setDiagnosticSink(store);
  logger.error("first");
  await world.flush();
  logger.warn("recovery");
  await world.flush();
  expect(store).toHaveBeenCalledTimes(2);
  expect(store.mock.calls[1][1]).toBe(1);
  expect(world.send).not.toHaveBeenCalled();
});
