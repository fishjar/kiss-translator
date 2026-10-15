jest.mock("../config/localModelTasks.json", () => ({
  ocrGroups: [{ id: "ocr-group" }],
  models: { asr: "asr", llm: "llm", vlm: "ocr-vlm" },
}));
import { resolveBuiltinCapabilities } from "./capabilities";
import { OPT_TRANS_LOCALAI, OPT_TRANS_OPENAI } from "../config/apiConstants";
import { builtinServiceDefinitions } from "./definitions";
import {
  projectApiCapabilities,
  supportsVlmApi,
} from "../config/serviceSelection";

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
      apiVersion: "1",
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
