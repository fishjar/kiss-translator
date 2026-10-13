import M3Theme from "../../hooks/M3Theme";
import { SETTINGS_FONT_SIZE, SETTINGS_HELPER_FONT_SIZE } from "./typography";
import DropdownRoot from "./DropdownRoot";
import Fade from "@mui/material/Fade";

const dropdownPaper = ({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 12,
  backgroundColor: theme.palette.background.paper,
  boxShadow: "0 4px 16px rgb(0 0 0 / 12%)",
  overscrollBehavior: "contain",
  "@media (prefers-reduced-motion: reduce)": {
    transitionDuration: "0.01ms !important",
  },
});

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
    MuiSelect: {
      defaultProps: {
        MenuProps: {
          anchorOrigin: { vertical: "bottom", horizontal: "left" },
          transformOrigin: { vertical: "top", horizontal: "left" },
        },
      },
      styleOverrides: {
        icon: {
          transition: "transform 90ms ease-out",
          "@media (prefers-reduced-motion: reduce)": {
            transitionDuration: "0.01ms !important",
          },
        },
      },
    },
    MuiMenu: {
      defaultProps: {
        slots: { root: DropdownRoot },
        autoFocus: false,
        disableAutoFocusItem: true,
        disableScrollLock: true,
        TransitionComponent: Fade,
        transitionDuration: { enter: 90, exit: 0 },
      },
      styleOverrides: {
        paper: (props) => ({
          ...dropdownPaper(props),
          // Popper positions the surface; neutralize Popover's paper offsets.
          position: "relative",
          top: "auto !important",
          left: "auto !important",
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "min(320px, calc(100vh - 32px))",
        }),
        list: { padding: 4 },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: (props) => ({ ...dropdownPaper(props), marginBlock: 4 }),
        listbox: { padding: 4, maxHeight: 320 },
        option: { minHeight: 40, borderRadius: 8 },
      },
    },
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
