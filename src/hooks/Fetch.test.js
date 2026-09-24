/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useAsyncNow } from "./Fetch";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("keeps immediate async state bound to the newest request", async () => {
  const first = deferred();
  const second = deferred();
  const request = jest.fn((value) =>
    value === "first" ? first.promise : second.promise
  );
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe({ value }) {
    const state = useAsyncNow(request, value);
    return (
      <output data-loading={state.loading} data-error={state.error || ""}>
        {state.data || ""}
      </output>
    );
  }

  act(() => root.render(<Probe value="first" />));
  expect(container.querySelector("output").dataset.loading).toBe("true");

  act(() => root.render(<Probe value="second" />));
  expect(container.querySelector("output").textContent).toBe("");

  await act(async () => {
    first.resolve("stale result");
    await first.promise;
  });
  expect(container.querySelector("output").dataset.loading).toBe("true");
  expect(container.querySelector("output").textContent).toBe("");

  await act(async () => {
    second.resolve("current result");
    await second.promise;
  });
  expect(container.querySelector("output").dataset.loading).toBe("false");
  expect(container.querySelector("output").textContent).toBe("current result");

  act(() => root.unmount());
  container.remove();
});
