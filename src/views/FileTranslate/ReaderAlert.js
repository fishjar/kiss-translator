import Alert from "@mui/material/Alert";

export default function ReaderAlert({ sx, ...props }) {
  return (
    <Alert
      {...props}
      sx={{
        py: 0.75,
        px: 1.5,
        borderRadius: 1,
        fontSize: 13,
        alignItems: "center",
        flexShrink: 0,
        "& .MuiAlert-icon": {
          py: 0,
          my: 0,
          fontSize: 20,
          mr: 1.25,
          display: "flex",
          alignItems: "center",
        },
        "& .MuiAlert-message": {
          py: 0,
          my: 0,
          fontSize: 13,
          lineHeight: 1.45,
        },
        "& .MuiAlert-action": {
          py: 0,
          my: 0,
          display: "flex",
          alignItems: "center",
        },
        ...sx,
      }}
    />
  );
}
