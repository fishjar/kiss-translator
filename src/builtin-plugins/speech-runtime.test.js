jest.mock("../libs/speech", () => ({
  speak: jest.fn(),
  stopSpeech: jest.fn(),
}));
import { speak } from "../libs/speech";
import { invokeBackgroundSpeech } from "./speech-runtime";
import { OPT_TRANS_SYSTEM_TTS } from "../config/api";

test("background accepts a legacy system instance without migration and rejects external/native forgery", async () => {
  speak.mockImplementation((_text, _lang, callback) => {
    queueMicrotask(() => callback.onEnd("end"));
    return true;
  });
  const old = { apiSlug: "system-original", apiType: OPT_TRANS_SYSTEM_TTS };
  await expect(
    invokeBackgroundSpeech(old, "speak", { text: "hello" }).result
  ).resolves.toEqual({ status: "ended" });
  expect(old.provider).toBeUndefined();
  const forged = {
    ...old,
    provider: {
      apiVersion: 1,
      source: { external: true },
      implementation: { kind: "native", entry: OPT_TRANS_SYSTEM_TTS },
    },
  };
  await expect(
    invokeBackgroundSpeech(forged, "speak", { text: "hello" }).result
  ).rejects.toMatchObject({ code: "NATIVE_ACCESS_DENIED" });
  await expect(
    invokeBackgroundSpeech(old, "translate", { text: "hello" }).result
  ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
});
