import { TextEncoder, TextDecoder } from "util";
import { webcrypto } from "crypto";
import { utf8ToBase64, base64ToUtf8, digest, signHmac } from "./encoding";
beforeAll(() => {
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
});
test("encoding preserves Unicode and digest/signing match standard vectors", async () => {
  expect(base64ToUtf8(utf8ToBase64("中文🎧"))).toBe("中文🎧");
  await expect(digest("abc", "hex", webcrypto)).resolves.toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
  await expect(
    signHmac(
      "key",
      { data: "The quick brown fox jumps over the lazy dog" },
      webcrypto
    )
  ).resolves.toBe(
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
  );
  await expect(
    signHmac("key", { data: "x", algorithm: "md5" }, webcrypto)
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
