import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import FavBtn from "./FavBtn";
import Typography from "@mui/material/Typography";

const phonicMap = {
  en_phonic: "英",
  us_phonic: "美",
};

export default function DictCont({ dictResult }) {
  if (!dictResult) {
    return;
  }

  return (
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
      >
        <Typography variant="subtitle1" style={{ fontWeight: "bold" }}>
          {dictResult.src}
        </Typography>
        <FavBtn word={dictResult.src} />
      </Stack>

      <Typography component="div">
        <Typography>
          {dictResult.voice
            ?.map(Object.entries)
            .map((item) => item[0])
            .map(([key, val]) => `${phonicMap[key] || key} ${val}`)
            .join(" ")}
        </Typography>
        <ul style={{ margin: "0.5em 0" }}>
          {dictResult.content[0].mean.map(({ pre, cont }, idx) => (
            <li key={idx}>
              {pre && `[${pre}] `}
              {Object.keys(cont).join("; ")}
            </li>
          ))}
        </ul>
      </Typography>
    </Box>
  );
}
