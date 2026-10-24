import { diagnosticRequest } from "./transport";
import { withoutBodies } from "./privacy";

export const logText = (record, includeBodies = false) => {
  const { time, level, environment, module, event, ...details } = includeBodies
    ? record
    : withoutBodies(record);
  return `${new Date(time).toISOString()} [${level.toUpperCase()}] [${environment}/${module}] ${event}\n${JSON.stringify(details, null, 2)}${record.truncated ? " [truncated]" : ""}`;
};

export async function collectLogExport(
  filter,
  metadata,
  request = diagnosticRequest
) {
  const records = [];
  let before, snapshot, response;
  do {
    response = await request("query", {
      filter,
      page: { before, snapshot, limit: 200 },
    });
    snapshot = response.snapshot;
    records.push(
      ...response.records.map((record) =>
        metadata.includeBodies ? record : withoutBodies(record)
      )
    );
    before = response.next;
  } while (before);
  return {
    ...metadata,
    exportedAt: new Date().toISOString(),
    filter,
    stats: response.stats,
    consoleLevel: response.consoleLevel,
    collectedLevels: ["debug", "info", "warn", "error"],
    limits: response.limits,
    storageError: response.storageError,
    truncatedCount: records.filter((record) => record.truncated).length,
    records,
  };
}

export function exportLogText(data) {
  const { records, ...metadata } = data;
  return `${JSON.stringify(metadata, null, 2)}\n\n${records.map((record) => logText(record, !!metadata.includeBodies)).join("\n")}`;
}
