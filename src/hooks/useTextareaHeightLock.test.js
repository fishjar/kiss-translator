import { act } from "react";
import { createRoot } from "react-dom/client";
import TextareaAutosize from "@mui/material/TextareaAutosize";
import useTextareaHeightLock from "./useTextareaHeightLock";

function LockHost({ lockKey, minRows = 3, onChange }) {
  const lock = useTextareaHeightLock(lockKey);
  onChange(lock);
  return (
    <div className="MuiInputBase-root">
      <TextareaAutosize
        ref={lock.textareaRef}
        minRows={minRows}
        maxRows={minRows + 5}
        data-testid={`ta-${lockKey}`}
      />
    </div>
  );
}

async function renderLock(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(ui));
  const fieldRoot = container.querySelector(".MuiInputBase-root");
  const textarea = container.querySelector("textarea");
  return { container, root, fieldRoot, textarea };
}

describe("useTextareaHeightLock", () => {
  let setItemSpy;

  beforeEach(() => {
    setItemSpy = jest.spyOn(Storage.prototype, "setItem");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("starts unlocked and leaves the InputBase root untouched", async () => {
    let lock;
    const { root, fieldRoot } = await renderLock(
      <LockHost lockKey="fresh-test" onChange={(api) => (lock = api)} />
    );
    expect(lock.lockedHeight).toBeNull();
    expect(fieldRoot.style.height).toBe("");
    expect(fieldRoot.classList).not.toContain("kt-height-locked");
    await act(async () => root.unmount());
  });

  test("pins the locked height on the root across host re-renders", async () => {
    let lock;
    const { root, fieldRoot } = await renderLock(
      <LockHost lockKey="pin-test" onChange={(api) => (lock = api)} />
    );
    await act(async () => lock.applyHeight(180));
    expect(fieldRoot.style.height).toBe("180px");
    expect(fieldRoot.classList).toContain("kt-height-locked");

    // Host re-render (a prop change makes TextareaAutosize resync) keeps
    // the root anchor and the pixel height.
    await act(async () =>
      root.render(
        <LockHost lockKey="pin-test" minRows={4} onChange={(api) => (lock = api)} />
      )
    );
    expect(fieldRoot.style.height).toBe("180px");
    expect(fieldRoot.classList).toContain("kt-height-locked");
    await act(async () => root.unmount());
  });

  test("restores the locked height and the root anchor after remount within the same session", async () => {
    let lock;
    const first = await renderLock(
      <LockHost lockKey="remember-me" onChange={(api) => (lock = api)} />
    );
    await act(async () => lock.applyHeight(220));
    await act(async () => first.root.unmount());

    let lock2;
    const second = await renderLock(
      <LockHost lockKey="remember-me" onChange={(api) => (lock2 = api)} />
    );
    expect(second.fieldRoot.style.height).toBe("220px");
    expect(second.fieldRoot.classList).toContain("kt-height-locked");
    await act(async () => second.root.unmount());
  });

  test("keeps two locks with different keys independent", async () => {
    let lockA;
    let lockB;
    const first = await renderLock(
      <LockHost lockKey="inst-a" onChange={(api) => (lockA = api)} />
    );
    const second = await renderLock(
      <LockHost lockKey="inst-b" onChange={(api) => (lockB = api)} />
    );
    await act(async () => lockA.applyHeight(150));
    expect(first.fieldRoot.style.height).toBe("150px");
    expect(first.fieldRoot.classList).toContain("kt-height-locked");
    expect(lockB.lockedHeight).toBeNull();
    expect(second.fieldRoot.style.height).toBe("");
    expect(second.fieldRoot.classList).not.toContain("kt-height-locked");
    await act(async () => first.root.unmount());
    await act(async () => second.root.unmount());
  });

  test("keeps the session memory out of any storage", async () => {
    let lock;
    const { root } = await renderLock(
      <LockHost lockKey="no-storage" onChange={(api) => (lock = api)} />
    );
    await act(async () => lock.applyHeight(120));
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("no-storage")).toBeNull();
    await act(async () => root.unmount());
  });
});
