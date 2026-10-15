import { invokeScene } from "./sceneInvocation";
import { invokeService } from "./serviceRuntime";
import { invokeBridgedService } from "./bridgeInvocation";
import { invokeBackgroundPlugin } from "./backgroundInvocation";
import { isBg } from "../libs/browser";
import * as client from "../libs/client";
jest.mock("../libs/client", () => ({ __esModule: true, isExt: true }));
jest.mock("../libs/browser", () => ({ isBg: jest.fn() }));
jest.mock("./backgroundInvocation", () => ({
  invokeBackgroundPlugin: jest.fn(),
}));
jest.mock("./serviceRuntime", () => ({ invokeService: jest.fn() }));
jest.mock("./bridgeInvocation", () => ({ invokeBridgedService: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  isBg.mockReturnValue(false);
  client.isExt = true;
});

test("a non-extension context cannot enter the background plugin route", () => {
  client.isExt = false;
  isBg.mockReturnValue(true);
  const api = {
    apiSlug: "external",
    provider: { implementation: { kind: "script" } },
  };
  invokeScene(api, "translate", {});
  expect(invokeBackgroundPlugin).not.toHaveBeenCalled();
  expect(invokeBridgedService).toHaveBeenCalledWith(
    "external",
    "translate",
    {},
    {}
  );
});

test("legacy records use compiled native dispatch without external permission or Sval", () => {
  const old = { apiSlug: "unchanged", apiType: "OpenAI", key: "mock" };
  const before = JSON.stringify(old);
  const input = { text: "hello" };
  invokeScene(old, "dictionary", input);
  expect(invokeService).toHaveBeenCalledWith(old, "dictionary", input, {});
  expect(invokeBridgedService).not.toHaveBeenCalled();
  expect(JSON.stringify(old)).toBe(before);
});

test.each(["script", "declarative"])(
  "background %s instances bypass the frontend relay",
  (kind) => {
    isBg.mockReturnValue(true);
    const api = { apiSlug: "selected", provider: { implementation: { kind } } };
    const input = { items: [{ id: "0", text: "hello" }] };
    const options = {
      signal: new AbortController().signal,
      timeoutMs: 100,
      streaming: "auto",
    };
    const call = { result: Promise.resolve({}), events: [], cancel: jest.fn() };
    invokeBackgroundPlugin.mockReturnValue(call);
    expect(invokeScene(api, "translate", input, options)).toBe(call);
    expect(invokeBackgroundPlugin).toHaveBeenCalledWith(
      api,
      "translate",
      input,
      options
    );
    expect(invokeBridgedService).not.toHaveBeenCalled();
    expect(invokeService).not.toHaveBeenCalled();
  }
);

test.each([undefined, { implementation: { kind: "native" } }])(
  "background native records retain compiled dispatch",
  (provider) => {
    isBg.mockReturnValue(true);
    const api = { apiSlug: "native", provider };
    const input = { text: "hello" };
    const call = { cancel: jest.fn() };
    invokeService.mockReturnValue(call);
    expect(invokeScene(api, "translate", input)).toBe(call);
    expect(invokeBackgroundPlugin).not.toHaveBeenCalled();
    expect(invokeBridgedService).not.toHaveBeenCalled();
  }
);

test("an external snapshot routes by existing instance ID through the privileged bridge", () => {
  const external = {
    apiSlug: "external",
    provider: { implementation: { kind: "script" } },
  };
  const input = { text: "hello" };
  invokeScene(external, "dictionary", input, { timeoutMs: 100 });
  expect(invokeBridgedService).toHaveBeenCalledWith(
    "external",
    "dictionary",
    input,
    { timeoutMs: 100 }
  );
});
