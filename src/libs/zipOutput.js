import { ZipWriter } from "@zip.js/zip.js";

// Keep zip.js's writer lock on the relay so the download sink can be aborted.
export async function writeZipOutput(writable, signal, addEntries) {
  const relay = new TransformStream();
  const abort = new AbortController();
  let failure;
  const stop = (error) => {
    if (!abort.signal.aborted) {
      failure = error;
      abort.abort(error);
    }
  };
  const cancel = () => stop(signal.reason);
  const check = () => {
    if (abort.signal.aborted) throw failure;
  };
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();

  const forward = relay.readable.pipeTo(writable, {
    signal: abort.signal,
    preventClose: true,
  });
  const pack = async () => {
    check();
    const writer = new ZipWriter(relay.writable);
    await addEntries(writer, abort.signal);
    check();
    await writer.close();
  };
  const tasks = [forward, pack()].map((task) =>
    task.catch((error) => {
      stop(error);
      throw error;
    })
  );
  try {
    await Promise.all(tasks);
    check();
    await writable.close();
  } catch (error) {
    stop(error);
    await Promise.allSettled(tasks);
    await writable.abort(failure).catch(() => {});
    throw failure;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
