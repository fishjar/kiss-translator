import { invokeTextScene, mapSubtitleGroups } from "./sceneAdapter";
import { invokePlugin } from "./bridge";
jest.mock("./bridge", () => ({ invokePlugin: jest.fn() }));

test("dictionary streams text while returning the authoritative final result", async () => {
  const onText = jest.fn();
  const cancel = jest.fn();
  invokePlugin.mockReturnValue({
    cancel,
    result: Promise.resolve({ text: "final" }),
    events: {
      async *[Symbol.asyncIterator]() {
        yield { type: "text.delta", text: "a" };
        yield { type: "text.delta", text: "b" };
      },
    },
  });
  const api = {
    apiSlug: "existing",
    useStream: true,
    provider: {
      capabilities: { dictionary: { outputModes: ["complete", "stream"] } },
    },
  };
  await expect(
    invokeTextScene(api, "dictionary", { text: "word" }, { onText })
  ).resolves.toBe("final");
  expect(onText.mock.calls).toEqual([["a"], ["ab"]]);
  expect(invokePlugin.mock.calls[0][0]).toBe("existing");
  expect(cancel).toHaveBeenCalledTimes(1);
});

test("subtitle IDs preserve timestamps and reject duplicates, gaps, and reordered coverage", () => {
  const events = [
    { start: 10, end: 20 },
    { start: 21, end: 30 },
  ];
  expect(
    mapSubtitleGroups(
      { groups: [{ ids: ["0", "1"], text: "hello", translation: "你好" }] },
      events
    )
  ).toEqual([
    { start: 10, end: 30, text: "hello", translation: "你好", _si: 0, _ei: 1 },
  ]);
  for (const ids of [["0", "0"], ["1", "0"], ["0"], ["0", "1", "2"]]) {
    expect(() =>
      mapSubtitleGroups({ groups: [{ ids, text: "x" }] }, events)
    ).toThrow();
  }
});

test("a final failure is not replaced by a successful partial text event", async () => {
  invokePlugin.mockReturnValue({
    cancel: jest.fn(),
    result: Promise.reject(new Error("truncated")),
    events: {
      async *[Symbol.asyncIterator]() {
        yield { type: "text.delta", text: "partial" };
      },
    },
  });
  await expect(
    invokeTextScene(
      { apiSlug: "id", provider: { implementation: { kind: "script" } } },
      "summarize",
      {}
    )
  ).rejects.toThrow("truncated");
});
