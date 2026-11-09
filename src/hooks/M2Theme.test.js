/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import { useTheme } from "@mui/material/styles";
import M2Theme from "./M2Theme";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockDarkMode = "auto";
let mockSystemDark = true;

jest.mock("./ColorMode", () => ({
  useDarkMode: () => ({ darkMode: mockDarkMode }),
}));
jest.mock("./SystemColorScheme", () => ({
  useSystemDarkPreference: () => mockSystemDark,
}));

let capturedTheme = null;
function ThemeProbe() {
  capturedTheme = useTheme();
  return null;
}

describe("M2Theme", () => {
  let container;
  let root;

  beforeEach(() => {
    capturedTheme = null;
    mockDarkMode = "auto";
    mockSystemDark = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("provides M2 4px border radius and compact defaults in dark mode", () => {
    act(() => {
      root.render(
        <M2Theme>
          <Button>Action</Button>
          <Chip label="Tag" />
          <TextField label="Input" />
          <ThemeProbe />
        </M2Theme>
      );
    });

    const themeRoot = container.querySelector(".kt-m2-root");
    expect(themeRoot).not.toBeNull();
    expect(themeRoot.dataset.theme).toBe("dark");
    expect(capturedTheme.palette.mode).toBe("dark");
    expect(capturedTheme.palette.primary.main).toBe("#1976d2");
    expect(capturedTheme.palette.primary.contrastText).toBe("#ffffff");
    expect(capturedTheme.shape.borderRadius).toBe(4);

    // 检查组件默认属性与样式覆盖
    expect(capturedTheme.components.MuiButton.defaultProps.size).toBe("small");
    expect(
      capturedTheme.components.MuiButton.styleOverrides.root.borderRadius
    ).toBe(4);
    expect(
      capturedTheme.components.MuiButton.styleOverrides.containedPrimary.color
    ).toBe("#ffffff");
    expect(capturedTheme.components.MuiTextField.defaultProps.size).toBe(
      "small"
    );
    expect(capturedTheme.components.MuiTextField.defaultProps.variant).toBe(
      "outlined"
    );
    expect(capturedTheme.components.MuiChip.defaultProps.size).toBe("small");
    expect(
      capturedTheme.components.MuiChip.styleOverrides.root.borderRadius
    ).toBe(4);
    expect(
      capturedTheme.components.MuiCard.styleOverrides.root.borderRadius
    ).toBe(4);
  });

  test("resolves light mode correctly when set to light", () => {
    mockDarkMode = "light";
    mockSystemDark = false;

    act(() => {
      root.render(
        <M2Theme>
          <ThemeProbe />
        </M2Theme>
      );
    });

    const themeRoot = container.querySelector(".kt-m2-root");
    expect(themeRoot.dataset.theme).toBe("light");
    expect(capturedTheme.palette.mode).toBe("light");
    expect(capturedTheme.palette.primary.main).toBe("#0B57D0");
    expect(capturedTheme.palette.primary.contrastText).toBe("#ffffff");
  });
});
