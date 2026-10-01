import { localAiRequest } from "./localAiBackground";
import { createAsyncQueue } from "./stream";
import { normalizeHttpTimeout, mergeAbortSignals } from "./request";

export const LOCAL_AI_CHAT_URL = "local-ai://chat";

export async function requestLocalChat(init, opts = {}, onToken) {
  const payload = JSON.parse(init.body);
  const result = await localAiRequest(
    {
      id: `local-chat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      service: "llm",
      method: "chat",
      payload,
    },
    {
      signal: opts.signal,
      timeoutMs: normalizeHttpTimeout(opts.httpTimeout),
      onStream: (event) => {
        if (event.type === "token") onToken?.(event.text);
      },
    }
  );
  if (result.aborted || opts.signal?.aborted)
    throw new DOMException("已取消", "AbortError");
  return {
    choices: [{ message: { role: "assistant", content: result.text } }],
  };
}

export async function* streamLocalChat(init, opts) {
  const queue = createAsyncQueue();
  const controller = new AbortController();
  let emitted = "";
  const push = (text) =>
    queue.push(JSON.stringify({ choices: [{ delta: { content: text } }] }));
  const pending = requestLocalChat(
    init,
    {
      ...opts,
      signal: mergeAbortSignals([opts.signal, controller.signal]),
    },
    (text) => {
      emitted += text;
      push(text);
    }
  ).then(
    (result) => {
      const full = result.choices[0].message.content || "";
      if (full.startsWith(emitted) && full.length > emitted.length)
        push(full.slice(emitted.length));
      queue.finish();
    },
    (error) => queue.error(error)
  );
  try {
    yield* queue.iterate();
  } finally {
    controller.abort();
    await pending;
  }
}
