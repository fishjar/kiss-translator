import { apiMicrosoftDict } from "../apis/index.js";
import { WordTooltipController } from "./wordHover";
import { normalizeHoverLookupCloseDelay } from "./modes";
import { KISS_UI_SELECTOR } from "../libs/kissUi";

jest.mock("../apis/index.js", () => ({ apiMicrosoftDict: jest.fn() }));
jest.mock("./favoriteWords.js", () => ({
  saveFavoriteWordIfMissing: jest.fn(async () => {}),
  createFavoriteButton: () => {
    const button = global.document.createElement("button");
    button.className = "test-favorite";
    button.textContent = "Favorite";
    return button;
  },
}));

const controllers = [];
const result = { trs: [{ pos: "n.", def: "A definition" }] };
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const pointer = (node, type, relatedTarget = null) =>
  node.dispatchEvent(new MouseEvent(type, { relatedTarget }));
const advance = async (ms) => {
  jest.advanceTimersByTime(ms);
  await flush();
};
const setup = (options = {}) => {
  document.body.innerHTML =
    '<div id="words"><span class="kiss-subtitle-word" data-word="hello">hello</span> <span class="kiss-subtitle-word" data-word="world">world</span></div>';
  const onClose = jest.fn();
  const controller = new WordTooltipController({ onClose, ...options });
  controllers.push(controller);
  controller.attachSpanListeners(document.querySelector("#words"));
  return {
    controller,
    onClose,
    words: Array.from(document.querySelectorAll("span")),
  };
};
const open = async (word) => {
  pointer(word, "pointerenter");
  await advance(300);
};

beforeEach(() => {
  jest.useFakeTimers();
  apiMicrosoftDict.mockReset().mockResolvedValue(result);
});
afterEach(() => {
  controllers.splice(0).forEach((c) => c.destroy());
  jest.useRealTimers();
  document.body.innerHTML = "";
});

test.each([undefined, null, -1, 31, 1.5, NaN, Infinity, "5"])(
  "invalid or legacy delay %s uses two seconds",
  (value) => {
    expect(normalizeHoverLookupCloseDelay(value)).toBe(2);
  }
);

test("opens after 300ms, then closes two seconds after leaving a word", async () => {
  const { controller, onClose, words } = setup();
  pointer(words[0], "pointerenter");
  await advance(299);
  expect(apiMicrosoftDict).not.toHaveBeenCalled();
  await advance(1);
  expect(controller.isOpen).toBe(true);
  pointer(words[0], "pointerleave");
  await advance(1999);
  expect(controller.isOpen).toBe(true);
  await advance(1);
  expect(controller.isOpen).toBe(false);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test.each([0, 5, 30])(
  "uses the configured %s second delay",
  async (closeDelay) => {
    const { controller, words } = setup({ closeDelay });
    await open(words[0]);
    pointer(words[0], "pointerleave");
    if (closeDelay) {
      await advance(closeDelay * 1000 - 1);
      expect(controller.isOpen).toBe(true);
      await advance(1);
    }
    expect(controller.isOpen).toBe(false);
  }
);

test("entering the panel cancels dismissal and panel operations keep it open; leaving closes immediately", async () => {
  const { controller, words } = setup();
  await open(words[0]);
  const panel = controller.tooltipEl;
  expect(panel.matches(KISS_UI_SELECTOR)).toBe(true);
  pointer(words[0], "pointerleave");
  await advance(1500);
  pointer(panel, "pointerenter");
  panel.dispatchEvent(new Event("scroll"));
  panel.querySelector(".test-favorite").click();
  const selection = window.getSelection();
  selection.selectAllChildren(panel.querySelector(".kiss-word-definition"));
  expect(selection.toString()).toContain("A definition");
  await advance(30000);
  expect(controller.tooltipEl).toBe(panel);
  pointer(panel, "pointerleave");
  expect(controller.isOpen).toBe(false);
});

test("a direct transition to the panel survives even with zero delay", async () => {
  const { controller, words } = setup({ closeDelay: 0 });
  await open(words[0]);
  const panel = controller.tooltipEl;
  pointer(words[0], "pointerleave", panel);
  pointer(panel, "pointerenter");
  await advance(5000);
  expect(controller.isOpen).toBe(true);
});

test("returning to the same word cancels closing without another lookup", async () => {
  const { controller, words } = setup();
  await open(words[0]);
  const panel = controller.tooltipEl;
  pointer(words[0], "pointerleave");
  await advance(1000);
  pointer(words[0], "pointerenter");
  await advance(5000);
  expect(controller.tooltipEl).toBe(panel);
  expect(apiMicrosoftDict).toHaveBeenCalledTimes(1);
});

test("old dictionary responses cannot overwrite the next word", async () => {
  let resolveOld;
  apiMicrosoftDict.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      })
  );
  const { controller, words } = setup();
  await open(words[0]);
  pointer(words[0], "pointerleave");
  await open(words[1]);
  resolveOld({ trs: [{ def: "OLD RESPONSE" }] });
  await flush();
  expect(controller.tooltipEl.textContent).toContain("world");
  expect(controller.tooltipEl.textContent).not.toContain("OLD RESPONSE");
});

test("a late response after closing or destroying cannot recreate the panel", async () => {
  let resolve;
  apiMicrosoftDict.mockImplementationOnce(
    () =>
      new Promise((finish) => {
        resolve = finish;
      })
  );
  const { controller, onClose, words } = setup();
  await open(words[0]);
  controller.tooltipEl.querySelector(".kiss-word-tooltip-close").click();
  expect(onClose).toHaveBeenCalledTimes(1);
  controller.destroy();
  resolve(result);
  await advance(10000);
  pointer(words[0], "pointerenter");
  await advance(300);
  expect(controller.isOpen).toBe(false);
  expect(apiMicrosoftDict).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test.each([null, new Error("offline"), result])(
  "all result states use the controlled close button",
  async (value) => {
    if (value instanceof Error) apiMicrosoftDict.mockRejectedValueOnce(value);
    else apiMicrosoftDict.mockResolvedValueOnce(value);
    const { controller, onClose, words } = setup();
    await open(words[0]);
    pointer(words[0], "pointerleave");
    controller.tooltipEl.querySelector(".kiss-word-tooltip-close").click();
    await advance(3000);
    expect(controller.tooltipEl).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  }
);
