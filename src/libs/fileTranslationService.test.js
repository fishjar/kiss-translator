import { executeFileTranslation } from "./fileTranslationService";
import { apiTranslate } from "../apis";
import { availableApiForScene } from "../config/serviceSelection";
jest.mock("../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("../config/serviceSelection", () => ({ availableApiForScene: jest.fn(), withScenePrompt: (api) => api }));
jest.mock("../config/prompt", () => ({ resolveApiPromptSettings: (api) => api }));
beforeEach(() => { apiTranslate.mockResolvedValue({ trText: "translated" }); });
test("local retries bypass HTTP and inference caches without changing saved service settings", async () => {
  const api = { apiType: "LocalAI", apiSlug: "local", useBatchFetch: true };
  availableApiForScene.mockReturnValue(api);
  await executeFileTranslation("text", { toLang: "zh" }, {}, undefined, { cacheMode: "refresh" });
  expect(apiTranslate).toHaveBeenCalledWith(expect.objectContaining({ cacheMode: "refresh",
    apiSetting: expect.objectContaining({ cacheMode: "refresh", useBatchFetch: true }) }));
  expect(api).toEqual({ apiType: "LocalAI", apiSlug: "local", useBatchFetch: true });
});
test("remote refresh bypasses the existing text cache", async () => {
  const api = { apiType: "Microsoft", apiSlug: "network" };
  availableApiForScene.mockReturnValue(api);
  await executeFileTranslation("text", { toLang: "zh" }, {}, undefined, { cacheMode: "refresh" });
  expect(apiTranslate.mock.calls.at(-1)[0].cacheMode).toBe("refresh");
  expect(apiTranslate.mock.calls.at(-1)[0].apiSetting).not.toHaveProperty("cacheMode");
});
