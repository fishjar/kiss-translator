/* eslint-disable testing-library/no-unnecessary-act */
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { useConfirmedPopupUpdate } from "./useConfirmedPopupUpdate";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useConfirmedPopupUpdate", () => {
  let container;
  let root;
  let current;
  let onError;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    onError = jest.fn();

    function Harness() {
      const [value, setValue] = useState({ fromLang: "en", toLang: "fr" });
      const update = useConfirmedPopupUpdate({ value, setValue, onError });
      current = { value, update };
      return null;
    }

    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function startUpdate(values) {
    const readback = deferred();
    let update;
    act(() => {
      update = current.update(values, () => readback.promise);
    });
    return {
      async resolve(value) {
        await act(async () => {
          readback.resolve(value);
          await update;
        });
      },
      async reject(error) {
        await act(async () => {
          readback.reject(error);
          await update;
        });
      },
    };
  }

  test.each([false, true])(
    "ignores a superseded swap field when the newer update is settled: %s",
    async (newerSettled) => {
      const swap = startUpdate({ fromLang: "fr", toLang: "en" });
      const source = startUpdate({ fromLang: "de" });
      expect(current.value).toEqual({ fromLang: "de", toLang: "en" });

      if (newerSettled) {
        await source.resolve({ fromLang: "de", toLang: "en" });
      }
      await swap.resolve({ fromLang: "de", toLang: "en" });

      expect(current.value).toEqual({ fromLang: "de", toLang: "en" });
      expect(onError).not.toHaveBeenCalled();
      if (!newerSettled) {
        await source.resolve({ fromLang: "de", toLang: "en" });
      }
      expect(onError).not.toHaveBeenCalled();
    }
  );

  test("reports a rejected swap field that has not been superseded", async () => {
    const swap = startUpdate({ fromLang: "fr", toLang: "en" });
    const source = startUpdate({ fromLang: "de" });
    await source.resolve({ fromLang: "de", toLang: "fr" });
    await swap.resolve({ fromLang: "de", toLang: "fr" });

    expect(current.value).toEqual({ fromLang: "de", toLang: "fr" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      new Error("Page state did not confirm the requested update")
    );
  });

  test("rolls back an owned field missing from the readback", async () => {
    const swap = startUpdate({ fromLang: "fr", toLang: "en" });
    const source = startUpdate({ fromLang: "de" });
    await source.resolve({ fromLang: "de", toLang: "en" });
    await swap.resolve({ fromLang: "de" });

    expect(current.value).toEqual({ fromLang: "de", toLang: "fr" });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("reports a transport failure only for fields the request still owns", async () => {
    const swap = startUpdate({ fromLang: "fr", toLang: "en" });
    const source = startUpdate({ fromLang: "de" });
    const error = new Error("Page connection closed");
    await swap.reject(error);

    expect(current.value).toEqual({ fromLang: "de", toLang: "fr" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    await source.resolve({ fromLang: "de", toLang: "fr" });
    expect(current.value).toEqual({ fromLang: "de", toLang: "fr" });
  });

  test("ignores an older transport failure after a newer confirmation", async () => {
    const older = startUpdate({ fromLang: "fr" });
    const newer = startUpdate({ fromLang: "de" });
    await newer.resolve({ fromLang: "de", toLang: "fr" });
    await older.reject(new Error("Stale page connection closed"));

    expect(current.value).toEqual({ fromLang: "de", toLang: "fr" });
    expect(onError).not.toHaveBeenCalled();
  });

  test("keeps a newer confirmation when an older success arrives later", async () => {
    const older = startUpdate({ fromLang: "fr" });
    const newer = startUpdate({ fromLang: "de" });
    await newer.resolve({ fromLang: "de", toLang: "fr" });
    await older.resolve({ fromLang: "fr", toLang: "fr" });

    expect(current.value).toEqual({ fromLang: "de", toLang: "fr" });
    expect(onError).not.toHaveBeenCalled();
  });

  test("recovers an older confirmation after the newer transport fails first", async () => {
    const older = startUpdate({ fromLang: "fr" });
    const newer = startUpdate({ fromLang: "de" });
    const error = new Error("Newer page connection closed");
    await newer.reject(error);
    expect(current.value).toEqual({ fromLang: "en", toLang: "fr" });

    await older.resolve({ fromLang: "fr", toLang: "fr" });

    expect(current.value).toEqual({ fromLang: "fr", toLang: "fr" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  test("uses an earlier readback to roll back a newer transport failure", async () => {
    const older = startUpdate({ fromLang: "fr" });
    const newer = startUpdate({ fromLang: "de" });
    await older.resolve({ fromLang: "fr", toLang: "fr" });
    expect(current.value).toEqual({ fromLang: "de", toLang: "fr" });

    const error = new Error("Newer page connection closed");
    await newer.reject(error);

    expect(current.value).toEqual({ fromLang: "fr", toLang: "fr" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  test("keeps a newer rejected value when an older success arrives later", async () => {
    const older = startUpdate({ fromLang: "fr" });
    const newer = startUpdate({ fromLang: "de" });
    await newer.resolve({ fromLang: "it", toLang: "fr" });
    expect(current.value).toEqual({ fromLang: "it", toLang: "fr" });

    await older.resolve({ fromLang: "fr", toLang: "fr" });

    expect(current.value).toEqual({ fromLang: "it", toLang: "fr" });
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
