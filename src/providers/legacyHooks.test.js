jest.mock("../libs/interpreter", () => ({ getInterpreter: jest.fn() }));
jest.mock("../libs/log", () =>
  jest.requireActual("../testUtils/scopedLogMock").withScopedLogMock({
    logger: { debug: jest.fn() },
  })
);
import { logger } from "../libs/log";
import { getInterpreter } from "../libs/interpreter";
import { callLegacyRequestHook, callLegacyResponseHook } from "./legacyHooks";
import { NATIVE_PRESET_OVERRIDES } from "../builtin-plugins/presets";

test("shipped Custom templates preserve their no-op result without starting Sval", async () => {
  const preset = NATIVE_PRESET_OVERRIDES.Custom;
  const log = logger.debug;
  try {
    await expect(
      callLegacyRequestHook(
        preset.reqHook,
        { text: "sample" },
        { url: "https://mock.invalid" }
      )
    ).resolves.toBeUndefined();
    await expect(
      callLegacyResponseHook(preset.resHook, { res: { text: "sample" } })
    ).resolves.toBeUndefined();
    expect(getInterpreter).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
  } finally {
    log.mockClear();
  }
});
test("edited legacy scripts still use their existing shared interpreter", async () => {
  const interpreter = {
    run: jest.fn(),
    exports: {
      reqHook: jest.fn(() => ({ body: "edited" })),
      resHook: jest.fn(() => ({ translations: [["edited"]] })),
    },
  };
  getInterpreter.mockResolvedValue(interpreter);
  await expect(
    callLegacyRequestHook("async()=>({body:'edited'})", {}, {})
  ).resolves.toEqual({ body: "edited" });
  await expect(
    callLegacyResponseHook("async()=>({translations:[['edited']]})", {})
  ).resolves.toEqual({ translations: [["edited"]] });
  expect(interpreter.run).toHaveBeenCalledTimes(2);
});
