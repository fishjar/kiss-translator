import { requestLocalChat } from "./localAiTransport";
import { localAiRequest } from "./localAiBackground";
jest.mock("./localAiBackground", () => ({ localAiRequest: jest.fn() }));
jest.mock("./request", () => ({
  normalizeHttpTimeout: () => 1000,
  mergeAbortSignals: () => undefined,
}));
jest.mock("./stream", () => ({ createAsyncQueue: jest.fn() }));
test("passes cache policy as RPC options without changing inference input", async () => {
  localAiRequest.mockResolvedValue({ text: "fresh" });
  const output = await requestLocalChat({
    body: JSON.stringify({
      cacheMode: "refresh",
      messages: [{ role: "user", content: "hello" }],
    }),
  });
  expect(output.choices[0].message.content).toBe("fresh");
  expect(localAiRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      options: { cacheMode: "refresh" },
      payload: { messages: [{ role: "user", content: "hello" }] },
    }),
    expect.anything()
  );
});
