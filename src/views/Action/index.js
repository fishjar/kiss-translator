import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import AddIcon from "@mui/icons-material/Add";
import ThemeProvider from "../../hooks/Theme";

export default function Action() {
  return (
    <ThemeProvider>
      <Box style={{ position: "fixed", top: 16, right: 16, zIndex: 10001 }}>
        <Fab color="primary">
          <AddIcon />
        </Fab>
      </Box>
    </ThemeProvider>
  );
}
