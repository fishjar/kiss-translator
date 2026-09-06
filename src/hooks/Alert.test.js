/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AlertProvider, useAlert } from "./Alert";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Controls() {
  const alert = useAlert();
  return (
    <>
      <button type="button" onClick={() => alert.info("First message")}>
        First
      </button>
      <button type="button" onClick={() => alert.error("Second message")}>
        Second
      </button>
    </>
  );
}

test("remounts the Snackbar for consecutive messages", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <AlertProvider>
        <Controls />
      </AlertProvider>
    )
  );

  await act(async () => container.querySelectorAll("button")[0].click());
  const firstSnackbar = document.body.querySelector(".MuiSnackbar-root");
  expect(firstSnackbar.textContent).toContain("First message");

  await act(async () => container.querySelectorAll("button")[1].click());
  const secondSnackbar = document.body.querySelector(".MuiSnackbar-root");
  expect(secondSnackbar).not.toBe(firstSnackbar);
  expect(secondSnackbar.textContent).toContain("Second message");

  act(() => root.unmount());
  container.remove();
});
