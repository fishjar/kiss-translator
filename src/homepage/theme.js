import { createTheme } from "@mui/material/styles";

const fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const getHomepageTheme = (mode) => {
  const dark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: {
        main: dark ? "#5eead4" : "#0f766e",
      },
      secondary: {
        main: dark ? "#fbbf24" : "#b45309",
      },
      background: {
        default: dark ? "#080b0f" : "#f7faf9",
        paper: dark ? "#10161d" : "#ffffff",
      },
      text: {
        primary: dark ? "#eef6f4" : "#12201f",
        secondary: dark ? "#9fb0ad" : "#52605d",
      },
    },
    typography: {
      fontFamily,
      h1: {
        fontWeight: 760,
        letterSpacing: 0,
      },
      h2: {
        fontWeight: 720,
        letterSpacing: 0,
      },
      h3: {
        fontWeight: 680,
        letterSpacing: 0,
      },
      button: {
        textTransform: "none",
        fontWeight: 700,
      },
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 6,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundImage: "none",
          },
        },
      },
    },
  });
};

export const getHomepageTokens = (mode) => {
  const dark = mode === "dark";

  return {
    border: dark ? "rgba(148, 163, 184, 0.2)" : "rgba(15, 23, 42, 0.12)",
    borderStrong: dark ? "rgba(94, 234, 212, 0.35)" : "rgba(15, 118, 110, 0.3)",
    panel: dark ? "rgba(16, 22, 29, 0.82)" : "rgba(255, 255, 255, 0.82)",
    panelSoft: dark ? "rgba(15, 23, 42, 0.58)" : "rgba(236, 253, 245, 0.7)",
    code: dark ? "#5eead4" : "#0f766e",
    amber: dark ? "#fbbf24" : "#b45309",
    muted: dark ? "#9fb0ad" : "#52605d",
    shadow: dark
      ? "0 24px 80px rgba(0, 0, 0, 0.35)"
      : "0 24px 80px rgba(15, 23, 42, 0.1)",
  };
};
