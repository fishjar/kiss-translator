// 数据源契约测试：homepage iconColor 经 localStorage 同步读取，非法输入回落
// 默认档。测试真实 hook（不走 shallow mock）— 反 shallow-mock 绿洗。
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_ICON_COLOR } from "../styles/m3";
import { ICON_COLOR_STORAGE_KEY } from "./content";
import { useHomepageIconColor } from "./useHomepageIconColor";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const probe = (container) => {
  let captured;
  function Probe() {
    captured = useHomepageIconColor();
    return null;
  }
  const root = createRoot(container);
  act(() => {
    root.render(<Probe />);
  });
  return {
    value: captured,
    unmount: () => {
      act(() => root.unmount());
    },
  };
};

afterEach(() => {
  localStorage.removeItem(ICON_COLOR_STORAGE_KEY);
});

test("falls back to DEFAULT_ICON_COLOR when localStorage has no stored value", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  try {
    const { value, unmount } = probe(container);
    expect(value.iconColor).toBe(DEFAULT_ICON_COLOR);
    expect(value.isLoading).toBe(false);
    unmount();
  } finally {
    container.remove();
  }
});

test("returns the stored canonical 6-digit hex verbatim", () => {
  localStorage.setItem(ICON_COLOR_STORAGE_KEY, "#a590ba");
  const container = document.createElement("div");
  document.body.appendChild(container);
  try {
    const { value, unmount } = probe(container);
    expect(value.iconColor).toBe("#a590ba");
    unmount();
  } finally {
    container.remove();
  }
});

test("normalizes non-canonical hex input via resolveIconColorHex", () => {
  // 非规范 6 位 Hex（大写、带空白、短格式）被 resolveIconColorHex 归一；
  // 完全不合法输入回落默认档。
  localStorage.setItem(ICON_COLOR_STORAGE_KEY, "#A590BA");
  const container = document.createElement("div");
  document.body.appendChild(container);
  try {
    const { value, unmount } = probe(container);
    // resolveIconColorHex: 合法 6 位透传（小写），"#A590BA" → "#a590ba"。
    expect(value.iconColor).toBe("#a590ba");
    unmount();
  } finally {
    container.remove();
  }
});

test("falls back to the default when localStorage holds a completely invalid value", () => {
  localStorage.setItem(ICON_COLOR_STORAGE_KEY, "not-a-hex");
  const container = document.createElement("div");
  document.body.appendChild(container);
  try {
    const { value, unmount } = probe(container);
    expect(value.iconColor).toBe(DEFAULT_ICON_COLOR);
    unmount();
  } finally {
    container.remove();
  }
});
