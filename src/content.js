import { run } from "./common";
import { browser, isExtensionContextInvalidatedError } from "./libs/browser";

// Mark the global execution context so getContext() can identify the host.
globalThis.__KISS_CONTEXT__ = "content";

let runtimeOrigin = "default";
let runtimeAvailable = true;
try {
  runtimeOrigin = browser?.runtime?.getURL?.("") || runtimeOrigin;
} catch (error) {
  if (!isExtensionContextInvalidatedError(error)) throw error;
  runtimeAvailable = false;
}
const runtimeMarker = `__KISS_CONTENT_RUNTIME__${runtimeOrigin}`;

const stopRuntimeManager = (manager) => {
  try {
    manager?.stop?.();
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      console.error("[KISS-Translator] Failed to stop content runtime", error);
    }
  }
};

let shouldStart = runtimeAvailable;
const existingRuntime = globalThis[runtimeMarker];

// A live marker deduplicates declarative and dynamic content-script injection.
// A marker from an updated extension closes over the invalidated old context.
if (
  shouldStart &&
  existingRuntime &&
  typeof existingRuntime === "object" &&
  typeof existingRuntime.probe === "function"
) {
  try {
    existingRuntime.probe();
    shouldStart = false;
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) throw error;
    try {
      existingRuntime.dispose?.();
    } catch (cleanupError) {
      if (!isExtensionContextInvalidatedError(cleanupError)) {
        console.error(
          "[KISS-Translator] Failed to dispose stale content runtime",
          cleanupError
        );
      }
    }
  }
}

if (shouldStart) {
  const identity = {};
  let manager;
  let disposed = false;
  const currentRuntime = {
    identity,
    probe: () => browser?.runtime?.getURL?.(""),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (globalThis[runtimeMarker]?.identity === identity) {
        delete globalThis[runtimeMarker];
      }
      stopRuntimeManager(manager);
      manager = undefined;
    },
  };
  globalThis[runtimeMarker] = currentRuntime;

  const handleStartupFailure = (error) => {
    currentRuntime.dispose();
    if (isExtensionContextInvalidatedError(error)) return;
    console.error("[KISS-Translator] Failed to start content runtime", error);
  };

  try {
    Promise.resolve(run())
      .then((startedManager) => {
        if (
          disposed ||
          globalThis[runtimeMarker]?.identity !== currentRuntime.identity
        ) {
          stopRuntimeManager(startedManager);
          return;
        }
        manager = startedManager;
      })
      .catch(handleStartupFailure);
  } catch (error) {
    handleStartupFailure(error);
  }
}
