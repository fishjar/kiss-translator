import React, { act } from "react";
import { createRoot } from "react-dom/client";
import Homepage from "./App";

jest.mock("@mui/material/styles/ThemeProvider", () => {
  return function MockThemeProvider({ children }) {
    return children;
  };
});

const videoIds = ["KcU2RpGkyvM", "l8lbWnyeda4", "QAiz68_jCQQ", "vo-XbIQ_GKg"];

describe("homepage video showcase", () => {
  let container;
  let root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  test("uses official YouTube embeds with external watch fallbacks", () => {
    act(() => root.render(<Homepage />));

    const iframes = [...container.querySelectorAll("iframe")];
    const watchLinks = [
      ...container.querySelectorAll(
        'a[href^="https://www.youtube.com/watch?v="]'
      ),
    ];

    expect(iframes).toHaveLength(videoIds.length);
    expect(watchLinks).toHaveLength(videoIds.length);

    videoIds.forEach((videoId, index) => {
      expect(iframes[index].getAttribute("src")).toBe(
        `https://www.youtube.com/embed/${videoId}`
      );
      expect(iframes[index].getAttribute("referrerpolicy")).toBe(
        "strict-origin-when-cross-origin"
      );
      expect(iframes[index].getAttribute("src")).not.toContain("si=");
      expect(watchLinks[index].getAttribute("href")).toBe(
        `https://www.youtube.com/watch?v=${videoId}`
      );
      expect(watchLinks[index].getAttribute("target")).toBe("_blank");
      expect(watchLinks[index].getAttribute("rel")).toBe("noopener noreferrer");
    });

    expect(container.innerHTML).not.toContain("youtube-nocookie.com");
  });

  test("renders all core homepage sections properly", () => {
    act(() => root.render(<Homepage />));

    expect(container.textContent).toContain("KISS Translator");
    expect(container.querySelector("#install-matrix")).not.toBeNull();
  });

  test("public/404.html executes inline script and corrects links under custom domain and subpath deployments", () => {
    const fs = require("fs");
    const path = require("path");
    const htmlPath = path.resolve(__dirname, "../../public/404.html");
    const html = fs.readFileSync(htmlPath, "utf-8");

    // 提取 public/404.html 中的 <script> 代码，直接执行实际脚本而不是复制逻辑
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatch).not.toBeNull();
    const scriptCode = scriptMatch[1];

    // 场景 1：自定义域名深层路径 /missing/deep
    document.body.innerHTML = `
      <a id="home-link" href="/">返回主页 / Home</a>
      <a id="options-link" href="/options.html">脚本设置 / Settings</a>
      <a id="file-link" href="/file-translate.html">文件翻译 / File Translate</a>
    `;
    delete window.location;
    window.location = new URL(
      "https://kiss-translator.rayjar.com/missing/deep"
    );

    new Function(scriptCode)();

    expect(document.getElementById("home-link").getAttribute("href")).toBe("/");
    expect(document.getElementById("options-link").getAttribute("href")).toBe(
      "/options.html"
    );
    expect(document.getElementById("file-link").getAttribute("href")).toBe(
      "/file-translate.html"
    );

    // 场景 2：GitHub Pages 子路径部署 /kiss-translator/missing/deep
    document.body.innerHTML = `
      <a id="home-link" href="/">返回主页 / Home</a>
      <a id="options-link" href="/options.html">脚本设置 / Settings</a>
      <a id="file-link" href="/file-translate.html">文件翻译 / File Translate</a>
    `;
    delete window.location;
    window.location = new URL(
      "https://fishjar.github.io/kiss-translator/missing/deep"
    );

    new Function(scriptCode)();

    expect(document.getElementById("home-link").getAttribute("href")).toBe(
      "/kiss-translator/"
    );
    expect(document.getElementById("options-link").getAttribute("href")).toBe(
      "/kiss-translator/options.html"
    );
    expect(document.getElementById("file-link").getAttribute("href")).toBe(
      "/kiss-translator/file-translate.html"
    );
  });
});
