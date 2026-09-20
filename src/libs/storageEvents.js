import { kissLog } from "./log";
import { browser } from "./browser";
import { isExt, isGm } from "./client";
import { getGmMethod } from "./gmMethods";

const listeners = new Map();
const invalidationListeners = new Map();
let stopPlatformEvents;

function invalidate(key) {
  const subscriptions =
    key === null
      ? [...invalidationListeners.values()]
      : [invalidationListeners.get(key)];
  subscriptions.forEach((subscription) => {
    subscription?.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        kissLog("Storage invalidation subscriber failed", key, error);
      }
    });
  });
}

function watchGmKey(key) {
  let active = true;
  let registration;
  let removeListener;
  try {
    const fallback = [window.KISS_GM];
    const addListener = getGmMethod(
      "addValueChangeListener",
      "GM_addValueChangeListener",
      fallback
    );
    removeListener = getGmMethod(
      "removeValueChangeListener",
      "GM_removeValueChangeListener",
      fallback
    );
    registration = Promise.resolve(
      addListener(key, (_name, _previous, _value, remote) => {
        if (active && remote !== false) invalidate(key);
      })
    );
    // Focus and pageshow still refresh when this optional API is unavailable.
    registration.catch(() => {});
  } catch {
    registration = undefined;
  }
  return () => {
    active = false;
    registration
      ?.then(
        (id) => {
          if (id !== undefined && id !== null) return removeListener(id);
        },
        () => {}
      )
      .catch((error) => kissLog("Unable to remove GM storage listener", error));
  };
}

function watchPlatformEvents() {
  const onResume = () => invalidate(null);
  const onExtensionChange = (changes, areaName) => {
    if (areaName === "local") Object.keys(changes).forEach(invalidate);
  };
  const onWebChange = (event) => {
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    invalidate(event.key);
  };
  if (isExt) {
    browser?.storage?.onChanged?.addListener?.(onExtensionChange);
  } else if (!isGm && typeof window !== "undefined") {
    window.addEventListener("storage", onWebChange);
  }
  if (typeof window !== "undefined") {
    // Resuming a page also covers missed events and managers without GM listeners.
    window.addEventListener("focus", onResume);
    window.addEventListener("pageshow", onResume);
  }
  return () => {
    if (isExt) {
      browser?.storage?.onChanged?.removeListener?.(onExtensionChange);
    } else if (!isGm && typeof window !== "undefined") {
      window.removeEventListener("storage", onWebChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pageshow", onResume);
    }
  };
}

/** Notify readers of external changes without writing or waiting for a reload. */
export function subscribeStorageInvalidation(key, listener) {
  if (!invalidationListeners.has(key)) {
    const subscription = { listeners: new Set(), stop: undefined };
    invalidationListeners.set(key, subscription);
    if (isGm) subscription.stop = watchGmKey(key);
  }
  const subscription = invalidationListeners.get(key);
  subscription.listeners.add(listener);
  if (!stopPlatformEvents) stopPlatformEvents = watchPlatformEvents();
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    subscription.listeners.delete(listener);
    if (!subscription.listeners.size) {
      subscription.stop?.();
      invalidationListeners.delete(key);
    }
    if (!invalidationListeners.size) {
      stopPlatformEvents?.();
      stopPlatformEvents = undefined;
    }
  };
}

export function subscribeStorageWrite(key, listener) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  const subscribers = listeners.get(key);
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) listeners.delete(key);
  };
}

export function publishStorageWrite(key, value, hasSyncMetadata = false) {
  listeners.get(key)?.forEach((listener) => {
    try {
      listener(value, hasSyncMetadata);
    } catch (error) {
      // A UI subscriber cannot turn a completed persistence into a failed write.
      kissLog("Storage subscriber failed", key, error);
    }
  });
}
