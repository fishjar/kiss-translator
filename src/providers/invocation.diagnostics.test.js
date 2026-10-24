import { createInvocation } from "./invocation";
import { captureDiagnostic } from "../libs/diagnostics/transport";
jest.mock("../libs/diagnostics/transport", () => ({
  captureDiagnostic: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
});
const options = { diagnostic: { serviceId: "service", method: "translate" } };

test.each([false, true])(
  "provider success/error has one correlated terminal record",
  async (fail) => {
    const call = createInvocation(async () => {
      if (fail)
        throw Object.assign(new Error("failed"), { code: "INVALID_RESPONSE" });
      return "ok";
    }, options);
    if (fail) await expect(call.result).rejects.toThrow("failed");
    else await expect(call.result).resolves.toBe("ok");
    call.cancel();
    expect(captureDiagnostic).toHaveBeenCalledTimes(2);
    expect(captureDiagnostic.mock.calls[1][0]).toMatchObject({
      level: fail ? "error" : "info",
      event: fail ? "invocation.failed" : "invocation.completed",
      context: {
        requestId: call.requestId,
        serviceId: "service",
        method: "translate",
      },
    });
  }
);

test("timeout is an error and cancellation is informational", async () => {
  jest.useFakeTimers();
  const timed = createInvocation(() => new Promise(() => {}), {
    ...options,
    timeoutMs: 10,
  });
  jest.advanceTimersByTime(11);
  await expect(timed.result).rejects.toHaveProperty("code", "REQUEST_TIMEOUT");
  expect(captureDiagnostic.mock.calls[1][0]).toMatchObject({
    level: "error",
    context: { code: "REQUEST_TIMEOUT" },
  });
  const cancelled = createInvocation(() => new Promise(() => {}), options);
  cancelled.cancel();
  await expect(cancelled.result).rejects.toHaveProperty(
    "code",
    "REQUEST_CANCELLED"
  );
  expect(captureDiagnostic.mock.calls[3][0]).toMatchObject({
    level: "info",
    context: { code: "REQUEST_CANCELLED" },
  });
});
