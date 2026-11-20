import { act } from "react";
import { createRoot } from "react-dom/client";
import { detectDevice } from "../../../localAi/core/deviceManager";
import Device from "./Device";

jest.mock("../../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) =>
    key === "capability_analyzeLayout" ? "版面分析" : fallback || key,
}));
jest.mock("../../../localAi/core/deviceManager", () => ({
  detectDevice: jest.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test.each([
  [true, true, "webgpu", "可运行"],
  [false, true, "wasm", "可运行"],
  [false, false, "无可用后端", "不可运行"],
])(
  "recommends a layout backend with WebGPU=%p and WASM SIMD=%p",
  async (webgpu, wasmSimd, backend, status) => {
    detectDevice.mockResolvedValue({
      webgpu,
      webgpuShaderF16: false,
      wasmSimd,
      browser: "Chrome",
      platform: "Win32",
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<Device />));
      const heading = [...container.querySelectorAll("h6")].find(
        (element) => element.textContent === "版面分析"
      );
      expect(heading.parentElement.textContent).toContain("PP-DocLayoutV3");
      expect(heading.parentElement.textContent).toContain(`→ ${backend}`);
      expect(
        heading.parentElement.querySelector(".MuiChip-label").textContent
      ).toBe(status);
    } finally {
      act(() => root.unmount());
    }
  }
);
