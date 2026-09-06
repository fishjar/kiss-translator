import { act } from "react";
import { createRoot } from "react-dom/client";
import Layout, { fetchLatestVersion, isWideOptionsPage } from "./Layout";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("uses the wide content rail for dense workspace pages", () => {
  expect(isWideOptionsPage("/apis")).toBe(true);
  expect(isWideOptionsPage("/playground")).toBe(true);
  expect(isWideOptionsPage("/prompts")).toBe(true);
  expect(isWideOptionsPage("/input")).toBe(false);
});

jest.mock("react-router-dom", () => ({
  Outlet: () => {
    const React = require("react");
    return React.createElement("a", { href: "#content" }, "content");
  },
  useLocation: () => ({ pathname: "/" }),
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

describe("mobile settings navigation", () => {
  beforeEach(() => {
    window.matchMedia = jest.fn(() => ({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
  });

  test("mounts a modal drawer, isolates the background, and restores focus", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Layout />));
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 1179px)");

    const menuButton = container.querySelector("button");
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
