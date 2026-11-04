import { FrameSelection } from "./frameSelection";
import {
  shouldSkipSelection,
  getSelectionContext,
  getSelectionSource,
  getSelectionButtonPosition,
} from "../hooks/useSelectionController";
import { SESSION_SELECTION } from "./pageSession";
import { shortcutRegister } from "./shortcut";
jest.mock("../hooks/useSelectionController", () => ({
  getSelectionContext: jest.fn(() => "source context"),
  getSelectionSource: jest.fn(() => ({
    sentence: "source sentence",
    url: "https://child.test",
  })),
  getSelectionButtonPosition: jest.fn(() => ({ x: 20, y: 30 })),
  getPointerButtonPosition: jest.fn(() => ({ x: 40, y: 50 })),
  shouldSkipSelection: jest.fn(async () => false),
}));
jest.mock("./shortcut", () => ({ shortcutRegister: jest.fn(() => jest.fn()) }));
const setting = (triggerMode) => ({
  tranboxSetting: { transOpen: true, triggerMode },
});
let controller;
beforeEach(() => {
  shortcutRegister.mockClear();
  document.body.innerHTML = "<p>Hello from a child</p>";
  shouldSkipSelection.mockReset().mockResolvedValue(false);
  getSelectionContext.mockReturnValue("source context");
  getSelectionSource.mockReturnValue({
    sentence: "source sentence",
    url: "https://child.test",
  });
  getSelectionButtonPosition.mockReturnValue({ x: 20, y: 30 });
  const range = document.createRange();
  range.selectNodeContents(document.querySelector("p"));
  range.getBoundingClientRect = () => ({ right: 20, bottom: 30 });
  const selection = {
    toString: () => "Hello from a child",
    rangeCount: 1,
    getRangeAt: () => range,
  };
  jest.spyOn(window, "getSelection").mockReturnValue(selection);
  jest.spyOn(document, "getSelection").mockReturnValue(selection);
});
afterEach(() => {
  controller?.disable();
  jest.restoreAllMocks();
});
const capture = async () => {
  document
    .querySelector("p")
    .dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

test("click trigger creates only a lightweight button and forwards bounded selection context", async () => {
  const send = jest.fn();
  controller = new FrameSelection(setting("click"), send);
  await capture();
  expect(
    send.mock.calls.filter(([action]) => action === SESSION_SELECTION)
  ).toHaveLength(0);
  document.querySelector(".KT-tranbtn").click();
  expect(send).toHaveBeenCalledWith(
    SESSION_SELECTION,
    expect.objectContaining({
      text: "Hello from a child",
      context: "source context",
    })
  );
  expect(document.querySelector("#kiss-translator-box")).toBeNull();
});

test("direct selection has no local panel or trigger button", async () => {
  const send = jest.fn();
  controller = new FrameSelection(setting("select"), send);
  await capture();
  expect(
    send.mock.calls.filter(([action]) => action === SESSION_SELECTION)
  ).toHaveLength(1);
  expect(document.querySelector(".KT-tranbtn")).toBeNull();
});

test("a disabled frame cannot reopen after asynchronous language detection", async () => {
  let finish;
  shouldSkipSelection.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const send = jest.fn();
  controller = new FrameSelection(setting("select"), send);
  await capture();
  controller.disable();
  finish(false);
  await Promise.resolve();
  expect(send).not.toHaveBeenCalled();
});

test("the shortcut opens an empty panel after the selection is cleared", async () => {
  const send = jest.fn();
  controller = new FrameSelection(
    {
      tranboxSetting: {
        ...setting("click").tranboxSetting,
        tranboxShortcut: ["KeyX"],
      },
    },
    send
  );
  await capture();
  window.getSelection.mockReturnValue(null);
  await capture();
  send.mockClear();

  await shortcutRegister.mock.calls[0][1]();

  expect(send).toHaveBeenCalledWith(
    SESSION_SELECTION,
    expect.objectContaining({ text: undefined })
  );
});

test("manual open filters the current selection instead of reopening the old one", async () => {
  const send = jest.fn();
  controller = new FrameSelection(setting("click"), send);
  await capture();
  window.getSelection.mockReturnValue({ toString: () => "Filtered text" });
  shouldSkipSelection.mockResolvedValue(true);
  send.mockClear();

  await controller.open();

  expect(shouldSkipSelection).toHaveBeenLastCalledWith(
    "Filtered text",
    undefined
  );
  expect(send).not.toHaveBeenCalled();
});

test("manual open drops its result if the selection changes during language detection", async () => {
  let finish;
  shouldSkipSelection.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const send = jest.fn();
  controller = new FrameSelection(setting("click"), send);

  const opening = controller.open();
  window.getSelection.mockReturnValue({ toString: () => "New selection" });
  finish(false);
  await opening;

  expect(send).not.toHaveBeenCalled();
});
