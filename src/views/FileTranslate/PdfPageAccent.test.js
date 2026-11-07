/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { readFileSync } from "fs";
import path from "path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import PdfPage from "./PdfPage";

jest.mock("../../libs/pdf/pdfDocument", () => ({ PDFJS: {} }));
jest.mock("pdfjs-dist/web/pdf_viewer.css", () => ({}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const source = readFileSync(path.resolve(__dirname, "PdfPage.js"), "utf8");
const accentTheme = createTheme({ palette: { primary: { main: "#0088ff" } } });

describe("PdfPage layout overlay accent tokenization", () => {
  test("region overlay styles consume theme tokens, not raw accent literals", () => {
    expect(source).not.toMatch(/1\.5px solid #/);
    expect(source).not.toMatch(/1\.5px dashed #/);
    expect(source).not.toMatch(/rgba\(25,\s*118,\s*210/);
    expect(source).not.toMatch(/rgba\(158,\s*158,\s*158/);
    expect(source).not.toMatch(/backgroundColor: isEnabled \? "#/);
    expect(source).toContain("useTheme()");
    expect(source).toContain("alpha(theme.palette.primary.main, 0.08)");
    expect(source).not.toMatch(/color: "#fff"/);
    expect(source).toMatch(
      /color: isEnabled[\s\S]{0,160}primary\.contrastText/
    );
  });

  test("source-highlight keeps its domain-semantics exemption, pinned", () => {
    // 判据：source-highlight 为「源文记号黄」域语义（R9），与 primary 强调色
    // 域不同；豁免以 accent-exempt 标记声明，色值出现次数钉死，漂移即红灯。
    expect((source.match(/#f5b400/g) || []).length).toBe(1);
    expect((source.match(/#ffcc0038/g) || []).length).toBe(1);
    expect(source).toMatch(/accent-exempt[\s\S]*?#ffcc0038/);
  });
});

test("region overlay colors follow an injected custom theme", async () => {
  const observer = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const pdf = {
    getPage: jest.fn(async () => ({
      getViewport: () => ({ width: 600, height: 800 }),
    })),
  };
  try {
    await act(async () =>
      root.render(
        <ThemeProvider theme={accentTheme}>
          <PdfPage
            pdf={pdf}
            number={1}
            width={600}
            zoom={1}
            showLayout
            regions={[
              { id: "first", type: "paragraph", bbox: [10, 20, 80, 40] },
            ]}
          />
        </ThemeProvider>
      )
    );
    const frame = container.querySelector(".kt-pdf-layout-layer > div");
    const label = container.querySelector(".kt-pdf-layout-layer > div > span");
    // jsdom 不展开 border 简写的颜色为 rgb() 形态，按 Fact Supremacy 以注入
    // 主题自身为锚（漂移敏感：实现硬编码任意字面量即红灯）。
    // 启用区描边取 augmentColor 派生暗档（与实现 F9 口径一致），label 底仍 main。
    expect(getComputedStyle(frame).borderColor).toBe(
      accentTheme.palette.primary.dark
    );
    expect(getComputedStyle(label).backgroundColor).toBe("rgb(0, 136, 255)");
  } finally {
    act(() => root.unmount());
    container.remove();
    globalThis.IntersectionObserver = observer;
  }
});

test("enabled region label foreground follows injected primary.contrastText", async () => {
  const observer = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  const lightPrimaryTheme = createTheme({
    palette: { primary: { main: "#ffe082", contrastText: "#0a2540" } },
  });
  const toRgb = (hex) =>
    `rgb(${[1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16))
      .join(", ")})`;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const pdf = {
    getPage: jest.fn(async () => ({
      getViewport: () => ({ width: 600, height: 800 }),
    })),
  };
  try {
    await act(async () =>
      root.render(
        <ThemeProvider theme={lightPrimaryTheme}>
          <PdfPage
            pdf={pdf}
            number={1}
            width={600}
            zoom={1}
            showLayout
            regions={[
              { id: "first", type: "paragraph", bbox: [10, 20, 80, 40] },
            ]}
          />
        </ThemeProvider>
      )
    );
    const label = container.querySelector(".kt-pdf-layout-layer > div > span");
    expect(getComputedStyle(label).backgroundColor).toBe("rgb(255, 224, 130)");
    expect(getComputedStyle(label).color).toBe(
      toRgb(lightPrimaryTheme.palette.primary.contrastText)
    );
  } finally {
    act(() => root.unmount());
    container.remove();
    globalThis.IntersectionObserver = observer;
  }
});
