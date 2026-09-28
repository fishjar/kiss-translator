import M3Theme from "../../hooks/M3Theme";
import { SETTINGS_FONT_SIZE, SETTINGS_HELPER_FONT_SIZE } from "./typography";

export { getMuiSwitchStyleOverrides } from "../../hooks/M3Theme";

// Theme values also reach menus and dialogs rendered outside the page shell.
const OPTIONS_THEME = {
  typography: {
    body1: { fontSize: SETTINGS_FONT_SIZE },
    body2: { fontSize: SETTINGS_FONT_SIZE },
    button: { fontSize: SETTINGS_FONT_SIZE },
    caption: { fontSize: SETTINGS_HELPER_FONT_SIZE },
  },
  components: {
    MuiButton: {
      styleOverrides: { root: { minHeight: 44, fontSize: SETTINGS_FONT_SIZE } },
    },
    MuiMenuItem: { styleOverrides: { root: { minHeight: 40 } } },
    MuiToggleButton: {
      styleOverrides: { root: { fontSize: SETTINGS_FONT_SIZE } },
    },
    MuiInputLabel: {
      styleOverrides: {
        // MUI scales floating labels by 0.75, producing the helper text size.
        shrink: { fontSize: SETTINGS_HELPER_FONT_SIZE / 0.75 },
      },
    },
  },
};

export default function OptionsTheme({ children }) {
  return <M3Theme options={OPTIONS_THEME}>{children}</M3Theme>;
}
