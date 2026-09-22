import { refreshStorageKeys, subscribeStorageRefresh } from "./storageRefresh";

describe("storage refresh subscriptions", () => {
  test("waits for other subscribers before rejecting a failed refresh", async () => {
    let finish;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const error = new Error("Refresh failed");
    const unsubscribeFailed = subscribeStorageRefresh("failed", () => {
      throw error;
    });
    const unsubscribePending = subscribeStorageRefresh(
      "pending",
      () => pending
    );
    let completed = false;
    const refresh = refreshStorageKeys(["failed", "pending"]).finally(() => {
      completed = true;
    });
    const assertion = expect(refresh).rejects.toBe(error);

    try {
      await Promise.resolve();
      await Promise.resolve();
      expect(completed).toBe(false);
      finish();
      await assertion;
      expect(completed).toBe(true);
    } finally {
      unsubscribeFailed();
      unsubscribePending();
    }
  });
});
