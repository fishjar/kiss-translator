import { createMenuKeyDownHandler, getMenuActiveElement } from "./menuFocus";

describe.each(["open", "closed"])(
  "menu navigation in a %s shadow root",
  (mode) => {
    let host;
    let shadow;
    let menu;
    let items;
    let navigate;

    beforeEach(() => {
      host = document.createElement("div");
      document.body.appendChild(host);
      shadow = host.attachShadow({ mode });
      menu = document.createElement("div");
      menu.setAttribute("role", "menu");
      shadow.appendChild(menu);
      items = ["Alpha", "Beta", "Disabled", "Bravo"].map((label, index) => {
        const item = document.createElement("button");
        item.setAttribute("role", "menuitem");
        item.tabIndex = -1;
        item.textContent = label;
        if (index === 2) item.setAttribute("aria-disabled", "true");
        menu.appendChild(item);
        return item;
      });
      navigate = createMenuKeyDownHandler({ shadowOnly: true });
      menu.addEventListener("keydown", navigate, true);
      items[0].focus();
    });

    afterEach(() => {
      host.remove();
      jest.restoreAllMocks();
    });

    const press = (key, options = {}) => {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        composed: true,
        cancelable: true,
        ...options,
      });
      shadow.activeElement.dispatchEvent(event);
      return event;
    };

    test("reads real focus, skips disabled items and wraps at both ends", () => {
      expect(document.activeElement).toBe(host);
      expect(getMenuActiveElement(menu)).toBe(items[0]);
      expect(press("ArrowDown").defaultPrevented).toBe(true);
      expect(shadow.activeElement).toBe(items[1]);
      press("ArrowDown");
      expect(shadow.activeElement).toBe(items[3]);
      press("ArrowDown");
      expect(shadow.activeElement).toBe(items[0]);
      press("ArrowUp");
      expect(shadow.activeElement).toBe(items[3]);
      press("Home");
      expect(shadow.activeElement).toBe(items[0]);
      press("End");
      expect(shadow.activeElement).toBe(items[3]);
    });

    test("supports repeated letters, word prefixes and timeout reset", () => {
      let now = 1000;
      jest.spyOn(Date, "now").mockImplementation(() => now);
      press("b");
      expect(shadow.activeElement).toBe(items[1]);
      press("b");
      expect(shadow.activeElement).toBe(items[3]);
      now += 600;
      press("b");
      press("r");
      expect(shadow.activeElement).toBe(items[3]);
      now += 600;
      press("a");
      expect(shadow.activeElement).toBe(items[0]);
    });

    test("keeps Select arrow navigation at its boundaries while typeahead can wrap", () => {
      menu.removeEventListener("keydown", navigate, true);
      menu.addEventListener(
        "keydown",
        createMenuKeyDownHandler({
          shadowOnly: true,
          disableListWrap: true,
        }),
        true
      );
      press("ArrowUp");
      expect(shadow.activeElement).toBe(items[0]);
      press("End");
      press("ArrowDown");
      expect(shadow.activeElement).toBe(items[3]);
      press("a");
      expect(shadow.activeElement).toBe(items[0]);
    });

    test("keeps handled keys out of MUI and leaves dismissal and activation to callers", () => {
      const bubble = jest.fn();
      menu.addEventListener("keydown", bubble);
      press("ArrowDown");
      press("z");
      expect(bubble).not.toHaveBeenCalled();
      for (const key of ["Escape", "Tab", "Enter", " "]) {
        expect(press(key).defaultPrevented).toBe(false);
      }
      expect(bubble).toHaveBeenCalledTimes(4);
      expect(press("a", { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(shadow.activeElement).toBe(items[1]);
    });
  }
);

test("leaves document menus to MUI when shadowOnly is enabled", () => {
  const menu = document.createElement("div");
  menu.innerHTML =
    '<button role="menuitem">Alpha</button><button role="menuitem">Beta</button>';
  document.body.appendChild(menu);
  menu.addEventListener(
    "keydown",
    createMenuKeyDownHandler({ shadowOnly: true }),
    true
  );
  const first = menu.firstElementChild;
  first.focus();
  const event = new KeyboardEvent("keydown", {
    key: "ArrowDown",
    bubbles: true,
    cancelable: true,
  });
  first.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(first);
  menu.remove();
});
