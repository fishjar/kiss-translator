jest.mock("./client", () => ({ isExt: false, isGm: false }));
jest.mock("./browser", () => ({ browser: undefined, isBg: () => false }));

const invalidState = () =>
  new DOMException("The database connection is closing", "InvalidStateError");

function createDatabase() {
  let closed = false;
  const database = {
    close: jest.fn(() => {
      closed = true;
    }),
    transaction: jest.fn(() => {
      if (closed) throw invalidState();
      let requests = 0;
      const transaction = {
        objectStore: () => ({
          get: () => {
            const request = {};
            requests += 1;
            Promise.resolve().then(() => {
              requests -= 1;
              request.onsuccess();
              if (!requests) {
                Promise.resolve().then(() => transaction.oncomplete());
              }
            });
            return request;
          },
        }),
      };
      return transaction;
    }),
  };
  return database;
}

describe("IndexedDB storage coordinator connection recovery", () => {
  let originalIndexedDb;
  let originalLocks;
  let open;
  let withStorageLock;

  beforeEach(() => {
    originalIndexedDb = Object.getOwnPropertyDescriptor(
      globalThis,
      "indexedDB"
    );
    originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
    open = jest.fn();
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: { open },
    });
    jest.isolateModules(() => {
      ({ withStorageLock } = require("./storageCoordination"));
    });
  });

  afterEach(() => {
    if (originalIndexedDb) {
      Object.defineProperty(globalThis, "indexedDB", originalIndexedDb);
    } else delete globalThis.indexedDB;
    if (originalLocks) {
      Object.defineProperty(navigator, "locks", originalLocks);
    } else delete navigator.locks;
  });

  function returnDatabase(database) {
    open.mockImplementationOnce(() => {
      const request = { result: database };
      Promise.resolve().then(() => request.onsuccess());
      return request;
    });
  }

  test.each(["onclose", "onversionchange"])(
    "reopens after %s and ignores late events from an obsolete connection",
    async (eventName) => {
      const first = createDatabase();
      const second = createDatabase();
      returnDatabase(first);
      returnDatabase(second);
      await expect(withStorageLock(() => "initial save")).resolves.toBe(
        "initial save"
      );
      await withStorageLock(() => "cached save");
      expect(open).toHaveBeenCalledTimes(1);

      first[eventName]();
      expect(first.close).toHaveBeenCalledTimes(1);
      await expect(withStorageLock(() => "recovered save")).resolves.toBe(
        "recovered save"
      );
      expect(open).toHaveBeenCalledTimes(2);

      first.onclose();
      await withStorageLock(() => "still usable");
      expect(open).toHaveBeenCalledTimes(2);
    }
  );

  test("reopens a closed cached connection before running the write exactly once", async () => {
    const first = createDatabase();
    const second = createDatabase();
    returnDatabase(first);
    returnDatabase(second);
    await withStorageLock(() => "initial save");
    first.close();
    const operation = jest.fn(() => "saved after storage clear");

    await expect(withStorageLock(operation)).resolves.toBe(
      "saved after storage clear"
    );
    expect(operation).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(2);
    expect(first.transaction).toHaveBeenCalledTimes(2);
    expect(second.transaction).toHaveBeenCalledTimes(1);
  });

  test("bounds reopening to one attempt and leaves later writes recoverable", async () => {
    const first = createDatabase();
    const second = createDatabase();
    const third = createDatabase();
    first.close();
    second.close();
    returnDatabase(first);
    returnDatabase(second);
    returnDatabase(third);
    const failedOperation = jest.fn();

    await expect(withStorageLock(failedOperation)).rejects.toMatchObject({
      name: "InvalidStateError",
    });
    expect(failedOperation).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(2);
    await expect(withStorageLock(() => "later save")).resolves.toBe(
      "later save"
    );
    expect(open).toHaveBeenCalledTimes(3);
  });

  test("does not retry other transaction errors or errors raised by a write", async () => {
    const database = createDatabase();
    returnDatabase(database);
    database.transaction.mockImplementationOnce(() => {
      throw new DOMException("Missing lock store", "NotFoundError");
    });
    const skippedOperation = jest.fn();
    await expect(withStorageLock(skippedOperation)).rejects.toMatchObject({
      name: "NotFoundError",
    });
    expect(skippedOperation).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);

    const failure = invalidState();
    const failedOperation = jest.fn(() => {
      throw failure;
    });
    await expect(withStorageLock(failedOperation)).rejects.toBe(failure);
    expect(failedOperation).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
    await expect(withStorageLock(() => "continued")).resolves.toBe("continued");
  });
});
