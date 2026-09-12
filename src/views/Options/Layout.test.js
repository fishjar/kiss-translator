import { act } from "react";
import { createRoot } from "react-dom/client";
import Layout, { fetchLatestVersion, isWideOptionsPage } from "./Layout";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockPathname = "/";

beforeEach(() => {
  mockPathname = "/";
});

test("uses the wide content rail for dense workspace pages", () => {
  expect(isWideOptionsPage("/apis")).toBe(true);
  expect(isWideOptionsPage("/playground")).toBe(true);
  expect(isWideOptionsPage("/prompts")).toBe(true);
  expect(isWideOptionsPage("/apis/")).toBe(true);
  expect(isWideOptionsPage("/prompts///")).toBe(true);
  expect(isWideOptionsPage("/input")).toBe(false);
});

jest.mock("react-router-dom", () => ({
  Outlet: () => {
    const React = require("react");
    return React.createElement("a", { href: "#content" }, "content");
  },
  useLocation: () => ({ pathname: mockPathname }),
}));
jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("./styles", () => ({ OPTIONS_STYLES: "" }));
jest.mock("./Header", () => {
  const React = require("react");
  return ({ onDrawerToggle, navigationOpen }) =>
    React.createElement(
      "button",
      {
        type: "button",
        "aria-expanded": navigationOpen,
        onClick: onDrawerToggle,
      },
      "menu"
    );
});
jest.mock("./Navigator", () => {
  const React = require("react");
  return ({ open, isMobile, onClose }) =>
    React.createElement(
      "aside",
      {
        id: "kt-options-navigation",
        role: isMobile ? "dialog" : undefined,
        "aria-modal": isMobile ? "true" : undefined,
        "aria-labelledby": isMobile ? "kt-options-navigation-title" : undefined,
        tabIndex: isMobile ? -1 : undefined,
      },
      React.createElement("input", { "aria-label": "search" }),
      React.createElement("a", { href: "#/" }, "overview"),
      isMobile
        ? React.createElement(
            "button",
            {
              type: "button",
              "aria-label": "options_close_navigation",
              onClick: onClose,
            },
            "close"
          )
        : null
    );
});

test.each([
  ["/apis/", "options_translation_services", true],
  ["/prompts///", "prompt_management", true],
  ["/playground/", "Playground", true],
  ["/rules/", "options_web_translation", false],
])("uses the matching page metadata at %s", (pathname, title, wide) => {
  mockPathname = pathname;
  const container = document.createElement("div");
  const root = createRoot(container);

  act(() => root.render(<Layout />));

  expect(container.querySelector("h1").textContent).toBe(title);
  expect(
    container
      .querySelector(".kt-options-main__inner")
      .classList.contains("kt-options-main__inner--wide")
  ).toBe(wide);

  act(() => root.unmount());
});

describe("mobile settings navigation", () => {
  let mediaQuery;
  let mediaQueryListeners;
  let originalMatchMedia;
  let originalRootStyle;
  let originalBodyStyle;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    originalRootStyle = document.documentElement.style.cssText;
    originalBodyStyle = document.body.style.cssText;
    mediaQueryListeners = new Set();
    mediaQuery = {
      matches: true,
      addEventListener: jest.fn((event, listener) => {
        mediaQueryListeners.add(listener);
      }),
      removeEventListener: jest.fn((event, listener) => {
        mediaQueryListeners.delete(listener);
      }),
    };
    window.matchMedia = jest.fn(() => mediaQuery);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.documentElement.style.cssText = originalRootStyle;
    document.body.style.cssText = originalBodyStyle;
  });

  test("mounts a modal drawer, isolates the background, and restores focus", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Layout />));
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 1179px)");

    const menuButton = container.querySelector("button");
    const restoreFocus = jest.spyOn(menuButton, "focus");
    const contentLink = container.querySelector('a[href="#content"]');
    expect(container.querySelector("#kt-options-navigation")).toBeNull();
    expect(menuButton.hasAttribute("tabindex")).toBe(false);
    expect(contentLink.hasAttribute("tabindex")).toBe(false);

    act(() => menuButton.click());
    const navigation = container.querySelector("#kt-options-navigation");
    const background = container.querySelector(".kt-options-background");
    expect(navigation.getAttribute("role")).toBe("dialog");
    expect(navigation.getAttribute("aria-modal")).toBe("true");
    expect(background.getAttribute("aria-hidden")).toBe("true");
    expect(background.hasAttribute("inert")).toBe(true);
    expect(menuButton.getAttribute("tabindex")).toBe("-1");
    expect(contentLink.getAttribute("tabindex")).toBe("-1");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(
      container.querySelector('input[aria-label="search"]')
    );

    const closeButton = navigation.querySelector(
      'button[aria-label="options_close_navigation"]'
    );
    act(() => closeButton.focus());
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
      );
    });
    expect(document.activeElement).toBe(
      container.querySelector('input[aria-label="search"]')
    );

    act(() => closeButton.click());
    expect(container.querySelector("#kt-options-navigation")).toBeNull();
    expect(document.activeElement).toBe(menuButton);
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
    expect(restoreFocus).toHaveBeenLastCalledWith({ preventScroll: true });

    act(() => menuButton.click());
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(container.querySelector("#kt-options-navigation")).toBeNull();
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");
    expect(background.hasAttribute("aria-hidden")).toBe(false);
    expect(background.hasAttribute("inert")).toBe(false);
    expect(menuButton.hasAttribute("tabindex")).toBe(false);
    expect(contentLink.hasAttribute("tabindex")).toBe(false);
    expect(document.activeElement).toBe(menuButton);

    act(() => root.unmount());
    container.remove();
  });

  test.each(["close", "unmount", "desktop", "route"])(
    "restores existing overflow declarations after %s",
    (cleanup) => {
      const rootStyle = document.documentElement.style;
      const bodyStyle = document.body.style;
      rootStyle.setProperty("overflow-x", "scroll", "important");
      bodyStyle.setProperty("overflow", "auto");
      bodyStyle.setProperty("overflow-y", "scroll", "important");
      const getOverflowStyles = () =>
        [rootStyle, bodyStyle].map((style) =>
          ["overflow", "overflow-x", "overflow-y"].map((property) => [
            style.getPropertyValue(property),
            style.getPropertyPriority(property),
          ])
        );
      const originalOverflow = getOverflowStyles();
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      let mounted = true;

      try {
        act(() => root.render(<Layout />));
        expect(getOverflowStyles()).toEqual(originalOverflow);
        act(() => container.querySelector("button").click());
        [rootStyle, bodyStyle].forEach((style) => {
          expect(style.overflow).toBe("hidden");
          expect(style.getPropertyPriority("overflow")).toBe("important");
        });
        bodyStyle.setProperty("color", "red");

        act(() => {
          if (cleanup === "unmount") {
            root.unmount();
            mounted = false;
          } else if (cleanup === "desktop") {
            mediaQuery.matches = false;
            mediaQueryListeners.forEach((listener) => listener(mediaQuery));
          } else if (cleanup === "route") {
            mockPathname = "/rules";
            root.render(<Layout />);
          } else {
            container
              .querySelector('button[aria-label="options_close_navigation"]')
              .click();
          }
        });

        expect(getOverflowStyles()).toEqual(originalOverflow);
        expect(bodyStyle.color).toBe("red");
      } finally {
        if (mounted) act(() => root.unmount());
        container.remove();
      }
    }
  );
});

describe("fetchLatestVersion", () => {
  const originalVersionUrl = process.env.REACT_APP_VERSION_URL;
  const originalGithubVersionUrl = process.env.REACT_APP_VERSION_URL_GITHUB;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.REACT_APP_VERSION_URL = "https://primary.example/version.txt";
    process.env.REACT_APP_VERSION_URL_GITHUB =
      "https://github.example/version.txt";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    if (originalVersionUrl === undefined) {
      delete process.env.REACT_APP_VERSION_URL;
    } else {
      process.env.REACT_APP_VERSION_URL = originalVersionUrl;
    }
    if (originalGithubVersionUrl === undefined) {
      delete process.env.REACT_APP_VERSION_URL_GITHUB;
    } else {
      process.env.REACT_APP_VERSION_URL_GITHUB = originalGithubVersionUrl;
    }
    global.fetch = originalFetch;
  });

  test("retries the GitHub URL once when the primary URL fails", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, text: async () => " 2.0.29\n" });

    await expect(fetchLatestVersion()).resolves.toBe("2.0.29");
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toMatch(
      /^https:\/\/primary\.example\/version\.txt\?t=/
    );
    expect(global.fetch.mock.calls[1][0]).toMatch(
      /^https:\/\/github\.example\/version\.txt\?t=/
    );
  });

  test("does not retry after an abort", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    global.fetch.mockRejectedValueOnce(abortError);

    await expect(fetchLatestVersion()).rejects.toBe(abortError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
