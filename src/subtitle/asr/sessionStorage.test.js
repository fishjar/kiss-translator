import { SessionAudioStorage } from "./sessionStorage";

test("session audio enforces its byte limit and releases every buffer", async () => {
  const store = new SessionAudioStorage(4);
  await store.putAudio("session", {
    index: 0,
    data: new Uint8Array([1, 2]).buffer,
  });
  await store.putAudio("session", {
    index: 1,
    data: new Uint8Array([3, 4]).buffer,
  });
  await expect(
    store.putAudio("session", { index: 2, data: new Uint8Array([5]).buffer })
  ).rejects.toHaveProperty("code", "AUDIO_QUOTA");
  expect(new Uint8Array((await store.getAudio("session", 1)).data)).toEqual(
    new Uint8Array([3, 4])
  );
  store.clear();
  expect(store.bytes).toBe(0);
  expect(await store.getAudio("session", 1)).toBeNull();
});
