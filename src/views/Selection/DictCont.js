import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import FavBtn from "./FavBtn";

const exchangeMap = {
  word_third: "第三人称单数",
  word_ing: "现在分词",
  word_done: "过去式",
  word_past: "过去分词",
  word_pl: "复数",
  word_proto: "词源",
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
        <div style={{ fontWeight: "bold" }}>
          {dictResult.simple_means?.word_name}
        </div>
        <FavBtn word={dictResult.simple_means?.word_name} />
      </Stack>

      {dictResult.simple_means?.symbols?.map(({ ph_en, ph_am, parts }, idx) => (
        <div key={idx}>
          {(ph_en || ph_am) && (
            <div>{`英 /${ph_en || ""}/ 美 /${ph_am || ""}/`}</div>
          )}
          <ul style={{ margin: "0.5em 0" }}>
            {parts.map(({ part, means }, idx) => (
              <li key={idx}>
                {part ? `[${part}] ${means.join("; ")}` : means.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div>
        {Object.entries(dictResult.simple_means?.exchange || {})
          .map(([key, val]) => `${exchangeMap[key] || key}: ${val.join(", ")}`)
          .join("; ")}
      </div>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {Object.values(dictResult.simple_means?.tags || {})
          .flat()
          .filter((item) => item)
          .map((item) => (
            <Chip label={item} size="small" />
          ))}
      </Stack>
    </Box>
  );
}
