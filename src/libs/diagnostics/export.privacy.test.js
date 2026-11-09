import { logText, collectLogExport } from "./export";
test("copy and export exclude body previews and detailed parameters unless explicitly included", async () => {
  const record = {
    time: 1,
    level: "info",
    environment: "background",
    module: "http",
    event: "http.success",
    context: {},
    request: {
      url: "https://example.com/chat",
      parameters: "https://example.com/chat?q=PRIVATE",
      preview: { text: "PRIVATE" },
    },
    response: { status: 200, preview: { text: "ANSWER" } },
  };
  expect(logText(record)).not.toMatch(/PRIVATE|ANSWER/);
  expect(logText(record, true)).toContain("ANSWER");
  const request = jest.fn(async () => ({
    records: [record],
    stats: {},
    next: null,
  }));
  expect(JSON.stringify(await collectLogExport({}, {}, request))).not.toContain(
    "PRIVATE"
  );
  expect(
    JSON.stringify(await collectLogExport({}, { includeBodies: true }, request))
  ).toContain("PRIVATE");
});
