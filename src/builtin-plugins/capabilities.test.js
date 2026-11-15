import { resolveBuiltinCapabilities } from "./capabilities";
import {
  OPT_TRANS_LOCALAI,
  OPT_TRANS_OPENAI,
  OPT_TRANS_PADDLEOCR,
} from "../config/apiConstants";
import { builtinServiceDefinitions } from "./definitions";
import {
  projectApiCapabilities,
  supportsVlmApi,
} from "../config/serviceSelection";
jest.mock("../config/localModelTasks.json", () => ({
  ocrGroups: [{ id: "ocr-group" }],
  asrTimestamps: { asr: true },
  models: { asr: "asr", llm: "llm", vlm: "ocr-vlm" },
}));

test.each(
  Object.keys(builtinServiceDefinitions).filter(
    (type) => type !== OPT_TRANS_LOCALAI
  )
)("%s cannot regain VLM capability from an old saved descriptor", (apiType) => {
  const api = {
    apiType,
    enabledCapabilities: ["parseImage"],
    provider: {
      ...builtinServiceDefinitions[apiType],
      apiVersion: 1,
      capabilities: {
        parseImage: {
          handler: "parseImage",
          inputModalities: ["image"],
          outputModes: ["complete"],
        },
      },
    },
  };
  expect(resolveBuiltinCapabilities(api)).not.toHaveProperty("parseImage");
  expect(projectApiCapabilities(api).provider.capabilities).not.toHaveProperty(
    "parseImage"
  );
  expect(supportsVlmApi(api)).toBe(false);
});

test("supported native capabilities depend on model, independently of enabled selections", async () => {
  const api = {
    apiType: OPT_TRANS_LOCALAI,
    modelRef: "asr",
    enabledCapabilities: ["transcribe", "chat", "recognizeText"],
  };
  const supported = await resolveBuiltinCapabilities(api);
  expect(Object.keys(supported)).toEqual(["transcribe"]);
  expect(supported.transcribe.timestamps).toBe(true);
  expect(
    await resolveBuiltinCapabilities({ ...api, enabledCapabilities: [] })
  ).toEqual(supported);
  expect(
    await resolveBuiltinCapabilities({ ...api, modelRef: "missing" })
  ).toEqual({});
});

test("OCR groups have real coordinates while text VLM recognition does not", async () => {
  const api = {
    apiType: OPT_TRANS_LOCALAI,
    enabledCapabilities: ["recognizeText"],
  };
  const group = await resolveBuiltinCapabilities({
    ...api,
    modelRef: "ocr-group",
  });
  const vlm = await resolveBuiltinCapabilities({ ...api, modelRef: "vlm" });
  expect(group.recognizeText.coordinates).toBe(true);
  expect(vlm).not.toHaveProperty("recognizeText");
  expect(vlm.parseImage.coordinates).toBe(false);
  expect(vlm.parseImage.taskModes).toEqual(["doc", "table", "formula"]);
});

test("PaddleOCR exposes exactly one capability per model", async () => {
  const text = await resolveBuiltinCapabilities({
    apiType: OPT_TRANS_PADDLEOCR,
    model: "PP-OCRv6",
  });
  expect(Object.keys(text)).toEqual(["recognizeText"]);
  expect(text.recognizeText.coordinates).toBe(true);

  const vlm = await resolveBuiltinCapabilities({
    apiType: OPT_TRANS_PADDLEOCR,
    model: "PaddleOCR-VL-1.6",
  });
  expect(Object.keys(vlm)).toEqual(["parseImage"]);
  // VLM 的 parsing_res_list 带 block_bbox，可以返回版面块坐标。
  expect(vlm.parseImage.coordinates).toBe(true);
  expect(vlm.parseImage.taskModes).toEqual(["doc"]);

  const structure = await resolveBuiltinCapabilities({
    apiType: OPT_TRANS_PADDLEOCR,
    model: "PP-StructureV3",
  });
  expect(Object.keys(structure)).toEqual(["analyzeLayout"]);

  // 旧配置或未知模型回退到默认的文字 OCR，而不是暴露全部能力。
  expect(
    Object.keys(
      await resolveBuiltinCapabilities({
        apiType: OPT_TRANS_PADDLEOCR,
        model: "unknown",
      })
    )
  ).toEqual(["recognizeText"]);
});

test("legacy user Hook argument mutation cannot alter another instance's compiled descriptors", async () => {
  const first = await resolveBuiltinCapabilities({ apiType: OPT_TRANS_OPENAI });
  first.translate.handler = "changed";
  first.translate.batch.supported = false;
  const second = await resolveBuiltinCapabilities({
    apiType: OPT_TRANS_OPENAI,
  });
  expect(second.translate.handler).toBe("translate");
  expect(second.translate.batch.supported).toBe(true);
});
