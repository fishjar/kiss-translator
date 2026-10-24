import { collectLogExport, exportLogText } from "./export";
test("export follows all filtered pages within one snapshot and includes diagnostics metadata", async () => {
  const record = {
    id: 3,
    time: 1,
    level: "error",
    environment: "content",
    module: "translation",
    event: "task.failed",
    context: { taskId: "a" },
    truncated: true,
  };
  const request = jest
    .fn()
    .mockResolvedValueOnce({ records: [record], snapshot: 3, next: 3 })
    .mockResolvedValueOnce({
      records: [{ ...record, id: 1 }],
      snapshot: 3,
      next: null,
      stats: { dropped: 2 },
      consoleLevel: 4,
      limits: { days: 7 },
    });
  const result = await collectLogExport(
    { taskId: "a" },
    { extensionVersion: "2.1.1" },
    request
  );
  expect(request.mock.calls[1][1]).toEqual({
    filter: { taskId: "a" },
    page: { before: 3, snapshot: 3, limit: 200 },
  });
  expect(result.records).toHaveLength(2);
  expect(result).toMatchObject({
    truncatedCount: 2,
    stats: { dropped: 2 },
    consoleLevel: 4,
  });
  expect(exportLogText(result)).toContain("[content/translation] task.failed");
});
