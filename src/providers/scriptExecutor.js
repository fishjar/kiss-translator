import { providerError } from "./capabilities";

export function createScriptExecutor(
  createWorker = async () =>
    (await import("./workerFactory")).createProviderWorker()
) {
  return async function runScript(snapshot, handler, input, ctx) {
    const worker = await createWorker();
    let timeout;
    let settled = false;
    const streams = new Map();
    let streamSequence = 0;
    let operations = 0;
    let requests = 0;
    return new Promise((resolve, reject) => {
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        ctx.signal.removeEventListener("abort", cancel);
        worker.terminate();
        for (const iterator of streams.values())
          void iterator.return?.().catch(() => {});
        streams.clear();
        if (error) reject(error);
        else resolve(result);
      };
      const cancel = () =>
        finish(
          ctx.signal.reason || providerError("REQUEST_CANCELLED", "Cancelled")
        );
      ctx.signal.addEventListener("abort", cancel, { once: true });
      if (ctx.signal.aborted) {
        cancel();
        return;
      }
      // Heartbeats keep network waits alive, but a fire-and-forget HTTP request cannot
      // disable the CPU watchdog and hide a subsequent synchronous infinite loop.
      const arm = () => {
        clearTimeout(timeout);
        timeout = setTimeout(
          () =>
            finish(
              providerError("SCRIPT_TIMEOUT", "Script computation timed out.")
            ),
          1000
        );
      };
      worker.onerror = () =>
        finish(providerError("SCRIPT_ERROR", "Script worker failed."));
      worker.onmessage = async ({ data }) => {
        if (settled) return;
        if (data.type === "heartbeat") {
          arm();
          return;
        }
        if (data.type === "result") {
          finish(undefined, data.result);
          return;
        }
        if (data.type === "error") {
          finish(
            Object.assign(new Error(data.error.message), {
              code: data.error.code,
            })
          );
          return;
        }
        if (data.type !== "sdk") return;
        const readsOrRequests = ["request", "asset.read"].includes(data.method);
        if (operations >= 64 || (readsOrRequests && requests >= 4)) {
          finish(
            providerError(
              "RESOURCE_BUDGET_EXCEEDED",
              "Too many pending SDK operations."
            )
          );
          return;
        }
        operations++;
        if (readsOrRequests) requests++;
        try {
          let result;
          if (data.method === "request")
            result = await ctx.http.request(data.args);
          else if (data.method === "emit") result = await ctx.emit(data.args);
          else if (data.method === "sign")
            result = await ctx.secrets.sign(data.args.ref, data.args.options);
          else if (data.method === "asset.read") {
            const blob = ctx.assets.get(data.args);
            if (blob.size > 8 * 1024 * 1024)
              throw providerError(
                "RESOURCE_BUDGET_EXCEEDED",
                "Asset exceeds 8 MiB."
              );
            result = await blob.arrayBuffer();
          } else if (data.method === "stream.start") {
            if (streams.size >= 4)
              throw providerError(
                "RESOURCE_BUDGET_EXCEEDED",
                "Too many streams."
              );
            result = ++streamSequence;
            streams.set(
              result,
              ctx.http.stream(data.args)[Symbol.asyncIterator]()
            );
          } else if (
            data.method === "stream.next" ||
            data.method === "stream.return"
          ) {
            const iterator = streams.get(data.args.streamId);
            if (!iterator)
              throw providerError(
                "STREAM_UNAVAILABLE",
                "Stream is not owned by this call."
              );
            result =
              data.method === "stream.next"
                ? await iterator.next()
                : await iterator.return();
            if (result.done) streams.delete(data.args.streamId);
          } else
            throw providerError("SDK_METHOD_DENIED", "Unknown SDK operation.");
          if (!settled) {
            worker.postMessage(
              { type: "reply", id: data.id, result },
              data.method === "asset.read" ? [result] : []
            );
          }
        } catch (error) {
          if (!settled) {
            worker.postMessage({
              type: "reply",
              id: data.id,
              error: { code: error.code, message: error.message },
            });
          }
        } finally {
          operations--;
          if (readsOrRequests) requests--;
        }
      };
      worker.postMessage({
        type: "start",
        code: snapshot.code,
        handler,
        input,
        config: ctx.config,
        resources: ctx.resources,
        options: ctx.options,
        requestId: ctx.requestId,
        serviceId: ctx.serviceId,
      });
      arm();
    });
  };
}
