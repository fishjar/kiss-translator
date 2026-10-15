import { describe, expect, it, vi } from "vitest";
import { InPageRuntimeHost } from "../../runtime/runtimeHostAdapter";

describe("local pending count subscription", () => {
  it("updates on request completion, cancellation and waiter removal", async () => {
    let complete: (value: any) => void = () => {};
    const manager: any = { modelManager: { subscribe() {} }, setCallbacks() {}, cancelRequest: vi.fn(), handleRequest: vi.fn(() => new Promise(resolve => { complete = resolve; })) };
    const host = new InPageRuntimeHost({ manager });
    const counts: number[] = [];
    const unsubscribe = host.onPendingChange(count => counts.push(count));
    const request = host.request({ id: "first", service: "runtime", method: "status", payload: {} });
    expect(counts).toEqual([0, 1]);
    complete({ ok: true, result: {} }); await request;
    expect(counts.at(-1)).toBe(0);
    const cancelled = host.request({ id: "cancel", service: "runtime", method: "status", payload: {} });
    host.cancel("cancel"); await expect(cancelled).rejects.toThrow("REQUEST_CANCELLED");
    expect(counts.at(-1)).toBe(0);
    void host.waitForImportTask("import", "model");
    expect(counts.at(-1)).toBe(1);
    host.cancelImportWaiter("import");
    expect(counts.at(-1)).toBe(0);
    unsubscribe(); const before = counts.length;
    const final = host.request({ id: "final", service: "runtime", method: "status", payload: {} });
    complete({ ok: true, result: {} }); await final;
    expect(counts).toHaveLength(before);
  });
});
