import { describe, expect, it, vi } from "vitest";
import { RuntimeManager } from "../../runtime/runtimeManager";
import { CATALOG, getCatalogModel, OCR_GROUPS } from "../catalog";
import type { AiRpcService } from "../../runtime/rpc";

function managerWithInstalled(ids: string[] = []) {
  const manager = new RuntimeManager();
  vi.spyOn(manager.modelManager, "init").mockResolvedValue(undefined);
  vi.spyOn(manager.modelManager, "get").mockImplementation((id) =>
    ids.includes(id)
      ? { manifest: getCatalogModel(id)!, state: "installed", files: {} }
      : undefined
  );
  return manager;
}

describe("missing local model messages", () => {
  it.each([
    ["translation", "translate", "llm"],
    ["llm", "chat", "llm"],
    ["vlm", "chat", "ocr-vlm"],
    ["doc", "analyze", "doc-layout"],
    ["asr", "transcribe", "asr"],
    ["tts", "synthesize", "tts"],
    ["decision", "predict", "decision"],
  ])("names the missing model for %s", async (service, method, task) => {
    const model = CATALOG.find((item) => item.task === task)!;
    const manager = managerWithInstalled();
    const load = vi.spyOn(manager as any, "prepareService");
    const response = await manager.handleRequest({
      id: `missing-${service}`, service: service as AiRpcService, method,
      payload: { modelRef: model.id, loadSpec: { device: model.backend[0] } },
    });
    expect(response).toMatchObject({
      ok: false, error: { code: "MODEL_NOT_INSTALLED", message: expect.stringContaining(model.name) },
    });
    expect(load).not.toHaveBeenCalled();
  });

  it.each([{ suffixes: [] }, { suffixes: ["det"] }, { suffixes: ["rec"] }])("lists only missing OCR components with $suffixes installed", async ({ suffixes }) => {
    const group = OCR_GROUPS.find((item) => item.id === "ppocr-v6-medium")!;
    const ids = [group.detId, group.recId];
    const installed = suffixes.map((suffix) => `${group.id}-${suffix}`);
    const manager = managerWithInstalled([...installed, "ppocr-v6-small-det", "ppocr-v6-small-rec"]);
    const response = await manager.handleRequest({
      id: "missing-ocr", service: "ocr", method: "recognize", payload: { modelRef: group.id },
    });
    expect(response.error?.code).toBe("MODEL_NOT_INSTALLED");
    for (const id of ids) {
      if (installed.includes(id)) expect(response.error?.message).not.toContain(getCatalogModel(id)!.name);
      else expect(response.error?.message).toContain(getCatalogModel(id)!.name);
    }
    expect(response.error?.message).not.toContain("small");
  });

  it.each(["llm", "vlm"])("names models in the independent %s loading check", async (service) => {
    const model = CATALOG.find((item) => item.task === (service === "vlm" ? "ocr-vlm" : "llm"))!;
    const manager = managerWithInstalled();
    await expect((manager as any).ensureLlmModel(model.id, "missing", undefined, undefined, undefined, service))
      .rejects.toThrow(`MODEL_NOT_INSTALLED: 模型未安装或下载不完整：${model.name}`);
  });

  it("does not report invalid model configuration as a missing installation", async () => {
    const manager = managerWithInstalled();
    await expect((manager as any).ensureLlmModel("unknown-model", "invalid"))
      .rejects.toThrow("INVALID_MODEL:");
  });
});
