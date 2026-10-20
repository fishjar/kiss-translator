import { AsrPauseGate } from "./pause";

test("pause waits survive rapid resume/pause and cancellation releases all waiters", async () => {
  const gate = new AsrPauseGate(), controller = new AbortController();
  gate.pause();
  let completed = false;
  const pending = gate.wait(controller.signal).then(() => { completed = true; });
  const cancelled = expect(pending).rejects.toHaveProperty("name", "AbortError");
  gate.resume();
  gate.pause();
  await Promise.resolve();
  expect(completed).toBe(false);
  expect(gate.waiters.size).toBe(1);
  controller.abort();
  await cancelled;
  expect(gate.waiters.size).toBe(0);
});

test("resume releases the existing wait without creating more work", async () => {
  const gate = new AsrPauseGate(), controller = new AbortController();
  gate.pause();
  const pending = gate.wait(controller.signal);
  gate.resume();
  await pending;
  await gate.wait(controller.signal);
  expect(gate.waiters.size).toBe(0);
});
