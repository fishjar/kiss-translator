import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function SugCont({ sugs }) {
  return (
    <Box>
      {sugs.map(({ k, v }) => (
        <Typography component="div" key={k}>
          <Typography>{k}</Typography>
          <ul style={{ margin: "0" }}>
            <li>{v}</li>
          </ul>
        </Typography>
      ))}
    </Box>
  );
}
