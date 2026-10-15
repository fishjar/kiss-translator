jest.mock("../libs/speech", () => ({
  speak: jest.fn(),
  stopSpeech: jest.fn(),
}));
import { speak, stopSpeech } from "../libs/speech";
import { speakNative } from "./system-speech";

test("cancelling an older system speech task does not globally stop a newer utterance", async () => {
  const callbacks = [];
  speak.mockImplementation((_text, _lang, callback) => {
    callbacks.push(callback);
    return true;
  });
  const first = new AbortController();
  const second = new AbortController();
  const old = speakNative({ text: "old" }, {}, { signal: first.signal });
  const current = speakNative({ text: "new" }, {}, { signal: second.signal });
  first.abort();
  await expect(old).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
  expect(stopSpeech).not.toHaveBeenCalled();
  callbacks[1].onEnd("end");
  await expect(current).resolves.toEqual({ status: "ended" });
  second.abort();
  expect(stopSpeech).not.toHaveBeenCalled();
});

test("active speech cancellation stops playback and a late terminal callback cannot convert it to success", async () => {
  let callback;
  speak.mockImplementation((_text, _lang, handlers) => {
    callback = handlers;
    return true;
  });
  const controller = new AbortController();
  const call = speakNative(
    { text: "hello" },
    {},
    { signal: controller.signal }
  );
  controller.abort();
  callback.onEnd("end");
  await expect(call).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
  expect(stopSpeech).toHaveBeenCalledTimes(1);
});
