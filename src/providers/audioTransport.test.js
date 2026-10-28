import { Blob as NodeBlob } from "buffer";
import { TextEncoder, TextDecoder } from "util";
import { audioAsset } from "./audioAsset";
import { createAssetStore, createTransportBroker } from "./transport";

const options = { encoding: "pcm_s16le", sampleRate: 24000, channels: 1 };
const originalBlob = global.Blob;
beforeAll(() => {
  global.Blob = NodeBlob;
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
});
afterAll(() => {
  global.Blob = originalBlob;
});

function fixture(bytes = Uint8Array.of(1, 2), mime = "audio/pcm") {
  const assets = createAssetStore();
  const fetchImpl = jest.fn(async () => {
    let done = false;
    return {
      ok: true,
      status: 200,
      headers: new Map([["content-type", mime]]),
      body: {
        getReader: () => ({
          read: async () => {
            if (done) return { done: true };
            done = true;
            return { done: false, value: bytes };
          },
          cancel: async () => {},
          releaseLock: () => {},
        }),
      },
    };
  });
  const broker = createTransportBroker(
    {
      apiSlug: "audio-test",
      provider: {
        apiVersion: 1,
        permissions: { network: ["https://audio.invalid"] },
      },
    },
    { assets, fetchImpl }
  );
  const request = {
    url: "https://audio.invalid/speech",
    responseType: "asset",
    responseAudio: options,
  };
  return { assets, fetchImpl, broker, request };
}

test("broker converts PCM and preserves existing WAV and ordinary MP3 bytes", async () => {
  const samples = Uint8Array.of(1, 2, 3, 4);
  const wav = new Uint8Array(
    await audioAsset(samples, "audio/pcm", options).arrayBuffer()
  );
  for (const [bytes, mime, conversion, expected, outputMime] of [
    [samples, "audio/pcm", options, wav, "audio/wav"],
    [wav, "audio/wav", options, wav, "audio/wav"],
    [
      Uint8Array.of(73, 68, 51),
      "audio/mpeg",
      undefined,
      Uint8Array.of(73, 68, 51),
      "audio/mpeg",
    ],
  ]) {
    const f = fixture(bytes, mime);
    const response = await f.broker.http.request({
      ...f.request,
      responseAudio: conversion,
    });
    expect(response.body.mimeType).toBe(outputMime);
    expect(
      new Uint8Array(await f.assets.get(response.body).arrayBuffer())
    ).toEqual(expected);
  }
});

test.each([
  { responseAudio: null },
  { responseAudio: { ...options, sampleRate: 0 } },
  { responseAudio: { ...options, encoding: "mp3" } },
  { responseType: "text" },
])(
  "broker rejects invalid conversion requests before HTTP: %j",
  async (changes) => {
    const f = fixture();
    await expect(
      f.broker.http.request({ ...f.request, ...changes })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(f.assets.entries()).toHaveLength(0);
  }
);

test("broker accepts PCM with its header exactly at the asset byte limit", async () => {
  const limit = 8 * 1024 * 1024;
  const f = fixture(new Uint8Array(limit - 44));
  const response = await f.broker.http.request(f.request);
  expect(f.assets.get(response.body).size).toBe(limit);
});

test("broker rejects PCM when its WAV header exceeds the asset byte limit", async () => {
  const f = fixture(new Uint8Array(8 * 1024 * 1024 - 42));
  await expect(f.broker.http.request(f.request)).rejects.toMatchObject({
    code: "RESOURCE_BUDGET_EXCEEDED",
  });
  expect(f.assets.entries()).toHaveLength(0);
});

test("broker accepts an eighth asset", async () => {
  const f = fixture();
  for (let i = 0; i < 7; i++) f.assets.put(new Blob(["x"]));
  await expect(f.broker.http.request(f.request)).resolves.toMatchObject({
    body: { mimeType: "audio/wav" },
  });
  expect(f.assets.entries()).toHaveLength(8);
});

test("broker rejects a ninth asset", async () => {
  const f = fixture();
  for (let i = 0; i < 8; i++) f.assets.put(new Blob(["x"]));
  await expect(f.broker.http.request(f.request)).rejects.toMatchObject({
    code: "RESOURCE_BUDGET_EXCEEDED",
  });
  expect(f.assets.entries()).toHaveLength(8);
});

test("broker includes existing assets in the byte budget", async () => {
  const f = fixture();
  f.assets.put(new Blob([new Uint8Array(8 * 1024 * 1024 - 44)]));
  await expect(f.broker.http.request(f.request)).rejects.toMatchObject({
    code: "RESOURCE_BUDGET_EXCEEDED",
  });
  expect(f.assets.entries()).toHaveLength(1);
});

test("broker rejects a truncated WAV without registering an asset", async () => {
  const wav = new Uint8Array(
    await audioAsset(Uint8Array.of(1, 2), "audio/pcm", options).arrayBuffer()
  );
  const f = fixture(wav.slice(0, -1), "audio/wav");
  await expect(f.broker.http.request(f.request)).rejects.toMatchObject({
    code: "INVALID_RESPONSE",
  });
  expect(f.assets.entries()).toHaveLength(0);
});
