import { useState, useEffect } from "react";
import Typography from "@mui/material/Typography";
import { apiBaiduSuggest } from "../../apis";
import Stack from "@mui/material/Stack";

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

  if (sugs.length === 0) {
    return;
  }

  return (
    <Stack spacing={1}>
      {sugs.map(({ k, v }) => (
        <Typography component="div" key={k}>
          <Typography>{k}</Typography>
          <Typography component="ul" style={{ margin: "0" }}>
            <Typography component="li">{v}</Typography>
          </Typography>
        </Typography>
      ))}
    </Stack>
  );
}
