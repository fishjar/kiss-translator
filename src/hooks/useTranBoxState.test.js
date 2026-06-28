import { useEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import useTranBoxState from "./useTranBoxState";
import { getTranBox } from "../libs/storage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../libs/mobile", () => ({
  isMobile: false,
}));

jest.mock("../libs/iframe", () => ({
  isIframe: false,
}));

jest.mock("../libs/storage", () => ({
  getTranBox: jest.fn(),
  debouncePutTranBox: jest.fn(),
}));

function TestTranBoxState({ onState }) {
  const state = useTranBoxState({});

  useEffect(() => {
    onState(state);
  });

  return null;
}

function renderTranBoxState() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let currentState;

  act(() => {
    root.render(
      <TestTranBoxState onState={(state) => (currentState = state)} />
    );
  });

  return {
    root,
    get state() {
      return currentState;
    },
  };
}

describe("useTranBoxState", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    getTranBox.mockReset();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 800,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 500,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    });
  });

  test("clamps restored fixed-position boxes inside the viewport", async () => {
    getTranBox.mockResolvedValue({ w: 320, h: 240, x: 790, y: 480 });
    const controller = renderTranBoxState();

    await act(async () => {
      await Promise.resolve();
    });

    expect(controller.state.boxPosition).toEqual({
      x: 464,
      y: 208,
    });

    act(() => {
      controller.root.unmount();
    });
  });

  test("restores oversized fixed-position boxes inside the viewport", async () => {
    getTranBox.mockResolvedValue({ w: 900, h: 700, x: 40, y: 480 });
    const controller = renderTranBoxState();

    await act(async () => {
      await Promise.resolve();
    });

    expect(controller.state.boxSize.w).toBe(784);
    expect(controller.state.boxSize.h).toBe(448);
    expect(controller.state.boxPosition).toEqual({
      x: 0,
      y: 0,
    });

    act(() => {
      controller.root.unmount();
    });
  });

  test("clamps open boxes after viewport resize", async () => {
    getTranBox.mockResolvedValue(undefined);
    const controller = renderTranBoxState();

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      controller.state.setBoxSize({ w: 700, h: 400 });
      controller.state.setBoxPosition({ x: 600, y: 400 });
      await Promise.resolve();
    });

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 500,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 350,
    });

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await Promise.resolve();
    });

    expect(controller.state.boxSize).toEqual({
      w: 484,
      h: 298,
    });
    expect(controller.state.boxPosition).toEqual({
      x: 0,
      y: 0,
    });

    act(() => {
      controller.root.unmount();
    });
  });
});
