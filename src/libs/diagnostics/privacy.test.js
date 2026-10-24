/** @jest-environment node */
import { endpoint, preview, scrub } from "./privacy";

test.each([
  ["audio", new Float32Array([0.125, 0.25])],
  ["bytes", new Uint8Array([11, 22])],
  ["buffer", new ArrayBuffer(8)],
  ["view", new DataView(new ArrayBuffer(8))],
])("nested %s bodies are omitted without enumeration", (_kind, binary) => {
  const read = jest.fn(() => "PRIVATE_BINARY");
  Object.defineProperty(binary, "privateData", { enumerable: true, get: read });
  const result = preview({ text: "keep this", nested: [{ binary }] });
  expect(result).toBeDefined();
  expect(JSON.parse(result.text)).toEqual({
    text: "keep this",
    nested: [{ binary: "[binary omitted]" }],
  });
  expect(read).not.toHaveBeenCalled();
  expect(preview(binary)).toBeUndefined();
});

test.each(["a", "ab", "abc", "@"])(
  "short configured secret %s is still redacted at every occurrence",
  (secret) => {
    expect(scrub(`${secret}|${secret}`, [secret])).toBe(
      "[redacted]|[redacted]"
    );
    expect(
      preview({ token: secret, echo: secret }, [secret]).text
    ).not.toContain(`"${secret}"`);
  }
);

test("short secrets retain substring redaction rather than a length cutoff", () => {
  expect(scrub("a cat", ["a"])).toBe("[redacted] c[redacted]t");
});

test.each(["ab", "@", 'long key\nwith quotes"'])(
  "raw, JSON-escaped and URL-encoded forms of %s are redacted",
  (secret) => {
    for (const representation of new Set([
      secret,
      JSON.stringify(secret).slice(1, -1),
      encodeURIComponent(secret),
    ])) {
      expect(scrub(representation, [secret])).toBe("[redacted]");
    }
    expect(preview({ echo: secret }, [secret]).text).toContain("[redacted]");
    expect(
      endpoint(`https://example.com/${encodeURIComponent(secret)}`, [secret])
    ).not.toContain(encodeURIComponent(secret));
  }
);
