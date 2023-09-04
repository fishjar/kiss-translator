import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import HomeIcon from "@mui/icons-material/Home";
import Stack from "@mui/material/Stack";
import DarkModeButton from "../Options/DarkModeButton";

export default function Header({ setShowPopup }) {
  const handleHomepage = () => {
    window.open(process.env.REACT_APP_HOMEPAGE, "_blank");
  };

  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      spacing={2}
    >
      <Stack direction="row" justifyContent="flex-start" alignItems="center">
        <IconButton onClick={handleHomepage}>
          <HomeIcon />
        </IconButton>
        <Box>
          {`${process.env.REACT_APP_NAME} v${process.env.REACT_APP_VERSION}`}
        </Box>
      </Stack>

      {setShowPopup ? (
        <IconButton
          onClick={() => {
            setShowPopup(false);
          }}
        >
          <CloseIcon />
        </IconButton>
      ) : (
        <DarkModeButton />
      )}
    </Stack>
  );
}
