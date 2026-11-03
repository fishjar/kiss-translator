/** @jest-environment node */
import { normalizeRecord, LOG_LIMITS, redact } from "./record";

test("keeps only allowed metadata, error frames and URL origins", () => {
  const result = normalizeRecord(
    {
      level: "error",
      module: "file",
      event: "request.failed",
      context: {
        requestId: "request-1",
        body: "private body",
        prompt: "private prompt",
        text: "private text",
        headers: { Authorization: "Bearer secret" },
      },
      error: {
        name: "Error",
        code: "INVALID_RESPONSE",
        message: "private output",
        stack:
          "Error: private output\nprivate multiline output\n    at run (https://api.example.com/private?token=secret:1:1)\n    at load (C:\\Users\\gabe\\private.js:2:1)",
      },
    },
    {
      tabId: 4,
      frameId: 2,
      environment: "content",
      url: "https://example.com/private?token=secret",
    }
  );
  expect(result.origin).toBe("https://example.com");
  expect(result.context).toEqual({ requestId: "request-1" });
  expect(result).toMatchObject({
    tabId: 4,
    frameId: 2,
    environment: "content",
  });
  expect(JSON.stringify(result)).not.toMatch(/private|secret|gabe/);
  expect(result.error.stack).toContain("at run");
});

test("large errors are bounded by UTF-8 bytes and marked when truncated", () => {
  const result = normalizeRecord({
    error: { stack: `    at ${"大".repeat(10000)}` },
  });
  expect(result.truncated).toBe(true);
  expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThan(
    LOG_LIMITS.recordBytes
  );
});

test("multiline error messages cannot masquerade as stack frames", () => {
  const error = new Error("response failed\n    at PRIVATE_RESPONSE_BODY");
  const result = normalizeRecord({ error });
  expect(JSON.stringify(result)).not.toContain("PRIVATE_RESPONSE_BODY");
});

test("stack frame and character limits also mark a record as truncated", () => {
  expect(
    normalizeRecord({ error: { stack: "    at frame\n".repeat(25) } }).truncated
  ).toBe(true);
  expect(
    normalizeRecord({ error: { stack: `    at ${"a".repeat(8000)}` } })
      .truncated
  ).toBe(true);
});

test("redacts credentials, embedded URLs, email and local paths", () => {
  expect(
    redact(
      "Bearer secret api_key=secret https://user:pass@example.com/path?key=secret gabe@example.com C:\\Users\\gabe\\file.js"
    )
  ).not.toMatch(/secret|pass|gabe|file\.js/);
});
