import { startLogTask } from "./task";
import { logger } from "../log";
jest.mock("../log", () =>
  jest.requireActual("../../testUtils/scopedLogMock").withScopedLogMock(
    (() => {
      const event = jest.fn();
      return { logger: { event, child: () => ({ event }) } };
    })()
  )
);
beforeEach(() => {
  jest.clearAllMocks();
});
test.each([
  [undefined, "info", "task.completed"],
  [new Error("private error"), "error", "task.failed"],
  [{ name: "AbortError" }, "info", "task.cancelled"],
  [{ code: "REQUEST_TIMEOUT" }, "error", "task.failed"],
])(
  "records one terminal event for success, failure, cancellation or timeout",
  (error, level, event) => {
    const task = startLogTask("translation", { taskId: "existing-task" });
    for (let n = 0; n < 100; n++) task.stage("loading");
    task.finish(error);
    task.finish();
    task.stage("late");
    expect(logger.event).toHaveBeenCalledTimes(3);
    expect(logger.event.mock.calls[2]).toEqual([
      level,
      event,
      expect.objectContaining({
        taskId: "existing-task",
        elapsedMs: expect.any(Number),
      }),
      error,
    ]);
  }
);
