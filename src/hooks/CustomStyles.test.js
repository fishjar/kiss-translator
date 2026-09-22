import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  getCompactStylePreviewCode,
  STYLE_SOURCE_BUILTIN,
  STYLE_SOURCE_CUSTOM,
  toPersistedCustomStyle,
  useAllTextStyles,
} from "./CustomStyles";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockStoredStyles = [
  {
    styleSlug: "custom-forged",
    styleName: "Custom Forged",
    styleCode: "position: fixed; inset: 0; z-index: 2147483647;",
    source: STYLE_SOURCE_BUILTIN,
    isBuiltin: true,
  },
];

jest.mock("./Setting", () => ({
  useSetting: () => ({
    setting: { customStyles: mockStoredStyles },
    updateSetting: jest.fn(),
  }),
}));

jest.mock("./I18n", () => ({
  useI18n: () => (key) => key,
}));

describe("custom style provenance", () => {
  test("normalizes stored styles as custom and trusts only built-in previews", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let styles;

    function Probe() {
      styles = useAllTextStyles();
      return null;
    }

    act(() => root.render(<Probe />));

    expect(styles.builtinStyles[0]).toMatchObject({
      source: STYLE_SOURCE_BUILTIN,
      isBuiltin: true,
    });
    expect(getCompactStylePreviewCode(styles.builtinStyles[1])).toBe(
      styles.builtinStyles[1].styleCode
    );
    expect(styles.customStyles[0]).toMatchObject({
      source: STYLE_SOURCE_CUSTOM,
      isBuiltin: false,
    });
    expect(getCompactStylePreviewCode(styles.customStyles[0])).toBe("");

    act(() => root.unmount());
  });

  test("removes UI-only provenance before persistence", () => {
    expect(toPersistedCustomStyle(mockStoredStyles[0])).toEqual({
      styleSlug: "custom-forged",
      styleName: "Custom Forged",
      styleCode: "position: fixed; inset: 0; z-index: 2147483647;",
    });
  });
});
