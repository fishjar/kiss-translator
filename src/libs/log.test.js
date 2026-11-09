import { logger } from "./log";
import { captureDiagnostic } from "./diagnostics/transport";
jest.mock("./diagnostics/transport", () => ({ captureDiagnostic: jest.fn() }));
beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  logger.setLevel("INFO");
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test.each(["WARN", "ERROR", "SILENT"])(
  "%s changes console output only, including scoped loggers",
  (level) => {
    logger.setLevel(level);
    console.log.mockClear();
    const scoped = logger.child("translation");
    logger.debug("private body", { prompt: "private prompt" });
    scoped.event("debug", "request.started", { requestId: "one" });
    expect(captureDiagnostic).toHaveBeenCalledTimes(2);
    expect(captureDiagnostic.mock.calls[0][0].event).toBe("legacy");
    expect(JSON.stringify(captureDiagnostic.mock.calls)).not.toMatch(/private/);
    expect(console.log).not.toHaveBeenCalled();
  }
);

test("scoped labels persist without dynamic console arguments, and errors remain identifiable", () => {
  const term = "PRIVATE_TERM";
  const url = "https://example.com/subscription?token=PRIVATE";
  const error = new Error("PRIVATE_ERROR");
  logger.child("translator").warn("Invalid RegExp for term:", term, error);
  logger.child("sub-rules").warn("sync subrule error; url:", url, error);

  expect(console.warn.mock.calls[0].slice(-3)).toEqual([
    "Invalid RegExp for term:",
    term,
    error,
  ]);
  expect(console.warn.mock.calls[1].slice(-3)).toEqual([
    "sync subrule error; url:",
    url,
    error,
  ]);
  expect(captureDiagnostic.mock.calls.map(([record]) => record.event)).toEqual([
    "Invalid RegExp for term:",
    "sync subrule error; url:",
  ]);
  for (const [record] of captureDiagnostic.mock.calls) {
    expect(record.error.name).toBe("Error");
    expect(JSON.stringify(record)).not.toMatch(/PRIVATE|subscription/);
  }
});
