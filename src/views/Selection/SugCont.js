import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { apiBaiduSuggest } from "../../apis";

export default function SugCont({ text }) {
  const [sugs, setSugs] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        setSugs(await apiBaiduSuggest(text));
      } catch (err) {
        // skip
      }
    })();
  }, [text]);

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
