import { useEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { APP_CONSTS } from "../config";
import useSelectionController from "./useSelectionController";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../libs/mobile", () => ({
  isMobile: false,
}));

function makeSelection(text, container, rectOverride) {
  const rect = rectOverride || {
    left: 10,
    right: 30,
    bottom: 40,
  };
  const range = {
    commonAncestorContainer: container?.firstChild || container,
    getBoundingClientRect: () => rect,
    getClientRects: () => [rect],
  };

  return {
    isCollapsed: !text,
    rangeCount: text ? 1 : 0,
    toString: () => text,
    getRangeAt: () => range,
  };
}

function createParagraph(text, parent = document.body) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  parent.appendChild(paragraph);
  return paragraph;
}

function createPanelTarget() {
  const host = document.createElement("div");
  host.id = APP_CONSTS.boxID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const wrapper = document.createElement("div");
  wrapper.className = `${APP_CONSTS.boxID}_wrapper`;
  shadow.appendChild(wrapper);

  return { host, shadow, wrapper };
}

function TestController({
  onState,
  triggerMode = "click",
  tranboxInteractMode = "-",
  followSelection = false,
  boxOffsetY = 0,
  boxSize = { w: 320, h: 240 },
  setBoxPosition = jest.fn(),
}) {
  const state = useSelectionController({
    tranboxSetting: {
      triggerMode,
      hideTranBtn: false,
      btnPositionMode: "fixed",
      btnOffsetX: 0,
      btnOffsetY: 0,
      tranboxInteractMode,
    },
    followSelection,
    boxOffsetX: 0,
    boxOffsetY,
    boxSize,
    setBoxPosition,
    hideClickAway: false,
  });

  useEffect(() => {
    onState(state);
  });

  return null;
}

function renderController(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const setBoxPosition = props.setBoxPosition || jest.fn();
  let currentState;

  act(() => {
    root.render(
      <TestController
        onState={(state) => (currentState = state)}
        setBoxPosition={setBoxPosition}
        {...props}
      />
    );
  });

  return {
    root,
    setBoxPosition,
    get state() {
      return currentState;
    },
  };
}

async function dispatchWindowMouseup(delay = 200) {
  await act(async () => {
    window.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );
    jest.advanceTimersByTime(delay);
    await Promise.resolve();
  });
}

async function dispatchPanelMouseup(target, composedPath) {
  await act(async () => {
    const event = new MouseEvent("mouseup", {
      bubbles: true,
      composed: true,
      button: 0,
    });
    Object.defineProperty(event, "pageX", { value: 120 });
    Object.defineProperty(event, "pageY", { value: 160 });
    Object.defineProperty(event, "composedPath", {
      value: () => composedPath,
    });

    target.dispatchEvent(event);
    jest.runOnlyPendingTimers();
    await Promise.resolve();
  });
}

describe("useSelectionController", () => {
  let currentSelection;
  let windowGetSelectionSpy;
  let documentGetSelectionSpy;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = "";
    currentSelection = null;
    windowGetSelectionSpy = jest
      .spyOn(window, "getSelection")
      .mockImplementation(() => currentSelection);
    documentGetSelectionSpy = jest
      .spyOn(document, "getSelection")
      .mockImplementation(() => currentSelection);
  });

  afterEach(() => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    });
    windowGetSelectionSpy.mockRestore();
    documentGetSelectionSpy.mockRestore();
    jest.useRealTimers();
  });

  test("keeps page selections pending until the trigger button in click mode", async () => {
    const controller = renderController();
    const pageParagraph = createParagraph("The library is open.");

    currentSelection = makeSelection("library", pageParagraph);
    await dispatchWindowMouseup();

    expect(controller.state.selectedText).toBe("library");
    expect(controller.state.text).toBe("");
    expect(controller.state.textContext).toBe("");
    expect(controller.state.showBtn).toBe(true);
    expect(controller.state.showBox).toBe(false);

    act(() => {
      controller.state.handleOpenTranbox();
    });

    expect(controller.state.text).toBe("library");
    expect(controller.state.textContext).toBe("The library is open.");
    expect(controller.state.showBox).toBe(true);

    act(() => {
      controller.root.unmount();
    });
  });

  test("keeps existing context when a later page mouseup has an empty selection", async () => {
    const controller = renderController();
    const pageParagraph = createParagraph("The library is open.");

    currentSelection = makeSelection("library", pageParagraph);
    await dispatchWindowMouseup();

    act(() => {
      controller.state.handleOpenTranbox();
    });

    expect(controller.state.textContext).toBe("The library is open.");
    expect(controller.state.showBox).toBe(true);

    currentSelection = makeSelection("", null);
    await dispatchWindowMouseup();

    expect(controller.state.text).toBe("library");
    expect(controller.state.textContext).toBe("The library is open.");

    act(() => {
      controller.root.unmount();
    });
  });

  test("ignores panel control clicks when preserving the current selection context", async () => {
    const controller = renderController();
    const pageParagraph = createParagraph("The library is open.");
    const { host, shadow, wrapper } = createPanelTarget();
    const tab = document.createElement("button");

    tab.setAttribute("role", "tab");
    wrapper.appendChild(tab);
    Object.defineProperty(shadow, "getSelection", {
      configurable: true,
      value: () => currentSelection,
    });

    currentSelection = makeSelection("library", pageParagraph);
    await dispatchWindowMouseup();

    act(() => {
      controller.state.handleOpenTranbox();
    });

    currentSelection = makeSelection(
      "Other",
      createParagraph("Other panel text.", wrapper)
    );
    await dispatchPanelMouseup(tab, [
      tab,
      wrapper,
      shadow,
      host,
      document.body,
      document,
      window,
    ]);

    expect(controller.state.text).toBe("library");
    expect(controller.state.selectedText).toBe("library");
    expect(controller.state.textContext).toBe("The library is open.");

    act(() => {
      controller.root.unmount();
    });
  });

  test("keeps panel text selections pending until the trigger button in click mode", async () => {
    const controller = renderController();
    const pageParagraph = createParagraph("The library is open.");
    const { host, shadow, wrapper } = createPanelTarget();
    const panelParagraph = createParagraph(
      "Panel selected word context.",
      wrapper
    );

    Object.defineProperty(shadow, "getSelection", {
      configurable: true,
      value: () => currentSelection,
    });

    currentSelection = makeSelection("library", pageParagraph);
    await dispatchWindowMouseup();

    act(() => {
      controller.state.handleOpenTranbox();
    });

    currentSelection = makeSelection("selected", panelParagraph);
    await dispatchPanelMouseup(panelParagraph, [
      panelParagraph,
      wrapper,
      shadow,
      host,
      document.body,
      document,
      window,
    ]);

    expect(controller.state.text).toBe("library");
    expect(controller.state.selectedText).toBe("selected");
    expect(controller.state.textContext).toBe("The library is open.");
    expect(controller.state.showBtn).toBe(true);

    act(() => {
      controller.state.handleOpenTranbox();
    });

    expect(controller.state.text).toBe("selected");
    expect(controller.state.textContext).toBe("Panel selected word context.");

    act(() => {
      controller.root.unmount();
    });
  });

  test("opens panel selections directly in panel interact click mode", async () => {
    const controller = renderController({ tranboxInteractMode: "click" });
    const pageParagraph = createParagraph("The library is open.");
    const { host, shadow, wrapper } = createPanelTarget();
    const panelParagraph = createParagraph(
      "Panel selected word context.",
      wrapper
    );

    Object.defineProperty(shadow, "getSelection", {
      configurable: true,
      value: () => currentSelection,
    });

    currentSelection = makeSelection("library", pageParagraph);
    await dispatchWindowMouseup();

    act(() => {
      controller.state.handleOpenTranbox();
    });

    currentSelection = makeSelection("selected", panelParagraph);
    await dispatchPanelMouseup(panelParagraph, [
      panelParagraph,
      wrapper,
      shadow,
      host,
      document.body,
      document,
      window,
    ]);

    expect(controller.state.text).toBe("selected");
    expect(controller.state.textContext).toBe("Panel selected word context.");
    expect(controller.state.showBtn).toBe(false);

    act(() => {
      controller.root.unmount();
    });
  });

  test("uses the pointer position when a panel selection has an empty rect", async () => {
    const controller = renderController();
    const { host, shadow, wrapper } = createPanelTarget();
    const panelParagraph = createParagraph(
      "Panel selected word context.",
      wrapper
    );

    Object.defineProperty(shadow, "getSelection", {
      configurable: true,
      value: () => currentSelection,
    });

    currentSelection = makeSelection("selected", panelParagraph, {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: 0,
      height: 0,
    });
    await dispatchPanelMouseup(panelParagraph, [
      panelParagraph,
      wrapper,
      shadow,
      host,
      document.body,
      document,
      window,
    ]);

    expect(controller.state.showBtn).toBe(true);
    expect(controller.state.position.x).toBeGreaterThan(0);
    expect(controller.state.position.y).toBeGreaterThan(0);

    act(() => {
      controller.root.unmount();
    });
  });

  test("updates text immediately for page and panel selections in select mode", async () => {
    const controller = renderController({ triggerMode: "select" });
    const pageParagraph = createParagraph("The library is open.");
    const { host, shadow, wrapper } = createPanelTarget();
    const panelParagraph = createParagraph(
      "Panel selected word context.",
      wrapper
    );

    Object.defineProperty(shadow, "getSelection", {
      configurable: true,
      value: () => currentSelection,
    });

    currentSelection = makeSelection("library", pageParagraph);
    await dispatchWindowMouseup();

    expect(controller.state.text).toBe("library");
    expect(controller.state.textContext).toBe("The library is open.");
    expect(controller.state.showBox).toBe(true);

    currentSelection = makeSelection("selected", panelParagraph);
    await dispatchPanelMouseup(panelParagraph, [
      panelParagraph,
      wrapper,
      shadow,
      host,
      document.body,
      document,
      window,
    ]);

    expect(controller.state.text).toBe("selected");
    expect(controller.state.textContext).toBe("Panel selected word context.");

    act(() => {
      controller.root.unmount();
    });
  });

  test("positions the followed box above a selection near the viewport bottom", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 500,
    });
    const controller = renderController({
      followSelection: true,
      boxOffsetY: 10,
      boxSize: { w: 320, h: 200 },
    });
    const pageParagraph = createParagraph("The library is open.");

    currentSelection = makeSelection("library", pageParagraph, {
      left: 10,
      right: 30,
      top: 420,
      bottom: 440,
      width: 20,
      height: 20,
    });
    await dispatchWindowMouseup();

    expect(controller.setBoxPosition).toHaveBeenLastCalledWith({
      x: 20,
      y: 158,
    });

    act(() => {
      controller.root.unmount();
    });
  });

  test("clamps the followed box inside the viewport when neither side fits", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 500,
    });
    const controller = renderController({
      followSelection: true,
      boxOffsetY: 10,
      boxSize: { w: 320, h: 480 },
    });
    const pageParagraph = createParagraph("The library is open.");

    currentSelection = makeSelection("library", pageParagraph, {
      left: 10,
      right: 30,
      top: 100,
      bottom: 120,
      width: 20,
      height: 20,
    });
    await dispatchWindowMouseup();

    expect(controller.setBoxPosition).toHaveBeenLastCalledWith({
      x: 20,
      y: 0,
    });

    act(() => {
      controller.root.unmount();
    });
  });

  test("falls back to the viewport top when the followed box is taller than the viewport", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 500,
    });
    const controller = renderController({
      followSelection: true,
      boxOffsetY: 10,
      boxSize: { w: 320, h: 600 },
    });
    const pageParagraph = createParagraph("The library is open.");

    currentSelection = makeSelection("library", pageParagraph, {
      left: 10,
      right: 30,
      top: 420,
      bottom: 440,
      width: 20,
      height: 20,
    });
    await dispatchWindowMouseup();

    expect(controller.setBoxPosition).toHaveBeenLastCalledWith({
      x: 20,
      y: 0,
    });

    act(() => {
      controller.root.unmount();
    });
  });
});
