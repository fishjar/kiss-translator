/* eslint-disable testing-library/no-container */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useTheme } from "@mui/material/styles";
import OptionsTheme from "./OptionsTheme";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/ColorMode", () => ({
  useDarkMode: () => ({ darkMode: "light" }),
}));
jest.mock("../../hooks/SystemColorScheme", () => ({
  useSystemDarkPreference: () => false,
}));

let capturedTheme;

function ThemeProbe() {
  capturedTheme = useTheme();
  return null;
}

test("dropdown paper radius stays a raw 12px in sx and styleOverrides", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <OptionsTheme>
        <ThemeProbe />
      </OptionsTheme>
    );
  });

  // A numeric borderRadius inside `sx` is multiplied by
  // theme.shape.borderRadius (12 * 12 = 144px) and clips the first/last
  // options, so the value must remain a length string.
  const selectPaperSx =
    capturedTheme.components.MuiSelect.defaultProps.MenuProps.PaperProps.sx;
  expect(selectPaperSx(capturedTheme).borderRadius).toBe("12px");

  const menuPaper = capturedTheme.components.MuiMenu.styleOverrides.paper({
    theme: capturedTheme,
  });
  expect(menuPaper.borderRadius).toBe("12px");

  act(() => root.unmount());
  container.remove();
});
