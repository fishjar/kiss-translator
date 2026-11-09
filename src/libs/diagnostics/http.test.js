/** @jest-environment node */
import { startHttpDiagnostic } from "./http";
import { captureDiagnostic, diagnosticDetail } from "./transport";
import { normalizeRecord } from "./record";
import { preview, endpoint, PREVIEW_BYTES, withoutBodies } from "./privacy";
jest.mock("./transport", () => ({
  captureDiagnostic: jest.fn(),
  diagnosticDetail: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  diagnosticDetail.mockResolvedValue({ enabled: false });
});
const NativeBlob = require("buffer").Blob;
global.Blob = NativeBlob;
global.Headers = class {
  constructor(values = {}) {
    this.values = Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]);
  }
  get(key) {
    return this.values.find(([k]) => k === key.toLowerCase())?.[1] || null;
  }
  [Symbol.iterator]() {
    return this.values[Symbol.iterator]();
  }
};
const Response = class {
  constructor(body, opts = {}) {
    this.status = opts.status || 200;
    this.ok = this.status < 400;
    this.headers = new Headers(opts.headers);
  }
};
const record = () => normalizeRecord(captureDiagnostic.mock.calls[0][0]);
test("default request retains endpoint, status and structure, never bodies or query values", async () => {
  const d = await startHttpDiagnostic(
    "https://user:pass@example.com/v1/chat?q=PRIVATE&key=SECRET#fragment",
    {
      method: "POST",
      headers: { Authorization: "Bearer SECRET" },
      body: JSON.stringify({ text: "PRIVATE" }),
    },
    { context: { taskId: "task" } }
  );
  d.response(
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
  d.body({ answer: "PRIVATE", token: "SECRET" });
  await d.finish();
  await d.finish();
  expect(captureDiagnostic).toHaveBeenCalledTimes(1);
  expect(record()).toMatchObject({
    request: { method: "POST" },
    response: { status: 200 },
    resultSummary: { type: "object", fields: ["answer", "token"] },
    context: { taskId: "task", outcome: "success" },
  });
  expect(record().request.url).toContain("/v1/chat?");
  expect(JSON.stringify(record())).not.toMatch(
    /PRIVATE|SECRET|user:pass|fragment/
  );
  expect(record().response.preview).toBeUndefined();
});
test("detailed bodies redact structured credentials and known secrets with UTF8 bounds", async () => {
  diagnosticDetail.mockResolvedValue({ enabled: true });
  const d = await startHttpDiagnostic(
    "https://example.com/chat?q=question&api_key=SECRET",
    {
      body: JSON.stringify({ text: "question", password: "SECRET" }),
      headers: { Authorization: "Bearer SECRET" },
    },
    { secrets: ["PRIVATE_KEY"] }
  );
  d.response(
    new Response("{}", { headers: { "content-type": "application/json" } })
  );
  d.body({
    answer: "answer",
    credential: "SECRET",
    echo: "PRIVATE_KEY",
    long: "中".repeat(6000),
  });
  await d.finish();
  const r = record();
  expect(r.request.preview.text).toContain("question");
  expect(r.request.parameters).toContain("q=question");
  expect(r.response.preview.text).toContain("answer");
  expect(JSON.stringify(r)).not.toMatch(/SECRET|PRIVATE_KEY/);
  expect(
    new TextEncoder().encode(r.response.preview.text).length
  ).toBeLessThanOrEqual(PREVIEW_BYTES);
  expect(r.truncated).toBe(true);
  expect(JSON.stringify(withoutBodies(r))).not.toContain("question");
});
test("a request started with capture disabled cannot gain bodies halfway through", async () => {
  const d = await startHttpDiagnostic("https://example.com");
  diagnosticDetail.mockResolvedValue({ enabled: true });
  d.response(new Response("text"));
  d.body("PRIVATE");
  await d.finish();
  expect(record().response.preview).toBeUndefined();
});
test("disabling detailed diagnostics drops in-flight previews", async () => {
  diagnosticDetail.mockResolvedValue({ enabled: true });
  const d = await startHttpDiagnostic("https://example.com", {
    body: "PRIVATE",
  });
  d.response(new Response("text"));
  d.body("PRIVATE");
  diagnosticDetail.mockResolvedValue({ enabled: false });
  await d.finish();
  expect(JSON.stringify(record())).not.toContain("PRIVATE");
});
test.each([
  ["TimeoutError", "timeout"],
  ["AbortError", "cancelled"],
  ["SyntaxError", "failed"],
])(
  "errors %s get stable outcome without private error messages",
  async (name, outcome) => {
    const d = await startHttpDiagnostic("https://example.com");
    await d.finish(Object.assign(new Error("PRIVATE_BODY"), { name }), false);
    expect(record().context.outcome).toBe(outcome);
    expect(JSON.stringify(record())).not.toContain("PRIVATE_BODY");
  }
);
test("streams collect a bounded preview and emit exactly one terminal record", async () => {
  diagnosticDetail.mockResolvedValue({ enabled: true });
  const d = await startHttpDiagnostic("https://example.com");
  d.response(
    new Response("", { headers: { "content-type": "text/event-stream" } })
  );
  for (let i = 0; i < 1000; i++)
    d.chunk(new TextEncoder().encode('data: {"text":"hello"}\n\n'));
  expect(captureDiagnostic).not.toHaveBeenCalled();
  await d.finish();
  expect(record().resultSummary).toMatchObject({
    type: "stream",
    chunks: 1000,
  });
  expect(record().response.preview.truncated).toBe(true);
});
test("binary request and response contents are omitted even in detailed diagnostics", async () => {
  diagnosticDetail.mockResolvedValue({ enabled: true });
  const d = await startHttpDiagnostic("https://example.com", {
    body: new Blob(["PRIVATE"]),
  });
  d.response(new Response("", { headers: { "content-type": "image/png" } }));
  d.body(new Blob(["PRIVATE"]));
  await d.finish();
  expect(record().resultSummary.type).toBe("binary");
  expect(JSON.stringify(record())).not.toContain("PRIVATE");
});
test("privacy helpers tolerate cycles and scrub URL credentials", () => {
  const v = { token: "PRIVATE" };
  v.self = v;
  expect(preview(v).text).not.toContain("PRIVATE");
  expect(
    endpoint("https://user:password@example.com/path?key=PRIVATE#fragment")
  ).not.toMatch(/PRIVATE|password|fragment/);
});

test("previews flag structural truncation and redact encoded configured credentials", () => {
  expect(preview(Array.from({ length: 100 }, () => 1)).truncated).toBe(true);
  expect(preview({ nested: { deeper: { key: "value" } } }).truncated).toBe(
    false
  );
  const secret = "secret with\nnewline";
  const body = preview('data: {"echo":' + JSON.stringify(secret) + "}\n", [
    secret,
  ]);
  expect(body.text).not.toContain("secret");
  expect(preview("data:text/plain;base64,UFJJVkFURQ==")).toBeUndefined();
  const endpointPreview = endpoint(
    "https://example.com/" + encodeURIComponent(secret),
    [secret]
  );
  expect(endpointPreview).not.toContain("secret");
  expect(preview("中".repeat(2000)).text).not.toContain("\ufffd");
});

test("SSE data without a space after the colon remains readable text", async () => {
  diagnosticDetail.mockResolvedValue({ enabled: true });
  const d = await startHttpDiagnostic("https://example.com");
  d.response(
    new Response("", { headers: { "content-type": "text/event-stream" } })
  );
  d.chunk(new TextEncoder().encode('data:{"text":"hello","done":true}\n\n'));
  await d.finish();
  expect(record().response.preview.text).toContain("hello");
  expect(preview("ABC".repeat(1000)).text).toHaveLength(3000);
});
test("binary response MIME types are case insensitive", async () => {
  diagnosticDetail.mockResolvedValue({ enabled: true });
  const d = await startHttpDiagnostic("https://example.com");
  d.response(new Response("", { headers: { "content-type": "IMAGE/PNG" } }));
  d.chunk(new TextEncoder().encode("PRIVATE_BINARY"));
  await d.finish();
  expect(record().response.preview).toBeUndefined();
  expect(record().resultSummary.type).toBe("binary");
});
