import { defaultServices } from "./defaultServices";
import { DEFAULT_API_LIST } from "./api";
import { supportedApiCapabilities } from "./serviceSelection";

test.each(["chrome", "edge", "firefox"])(
  "%s installs ready-to-configure local services without changing templates",
  (client) => {
    const services = defaultServices(client);
    expect(services).toHaveLength(41);
    expect(new Set(services.map((api) => api.apiSlug)).size).toBe(41);
    expect(services.filter((api) => !api.isDisabled)).toHaveLength(11);
    const local = services.filter((api) => api.apiType === "LocalAI");
    expect(local.map((api) => [api.modelRef, api.device])).toEqual([
      ["laya-multilingual-int8", "webgpu"],
      ["sensevoice-small", "webgpu"],
      ["ppocr-v6-medium", "webgpu"],
      ["paddleocr-vl-1.6-onnx-q8", "webgpu"],
      ["hy-mt2-1.8b", "webgpu"],
      ["pp-doclayout-v3-onnx", "wasm"],
    ]);
    for (const api of local) {
      expect(api.enabledCapabilities).toEqual(supportedApiCapabilities(api));
      expect(api.enabledCapabilities.length).toBeGreaterThan(0);
    }
    expect(services.find((api) => api.apiType === "SystemTTS")).toMatchObject({
      isDisabled: false,
      enabledCapabilities: ["speak"],
    });
    expect(DEFAULT_API_LIST).toHaveLength(36);
    expect(
      DEFAULT_API_LIST.find((api) => api.apiType === "LocalAI").modelRef
    ).toBe("");
  }
);

test.each(["web", "userscript", "safari", "thunderbird"])(
  "%s retains the original defaults",
  (client) => {
    expect(defaultServices(client)).toBe(DEFAULT_API_LIST);
  }
);
