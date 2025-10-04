import Typography from "@mui/material/Typography";
import AudioBtn from "./AudioBtn";
import { OPT_DICT_BING, OPT_DICT_YOUDAO } from "../../config";
import { apiMicrosoftDict, apiYoudaoDict } from "../../apis";

export const dictHandlers = {
  [OPT_DICT_BING]: {
    apiFn: apiMicrosoftDict,
    toText: (data) =>
      data.trs?.map(({ pos, def }) => `${pos ? `[${pos}] ` : ""}${def}`) || [],
    uiAudio: (data) => (
      <Typography component="div">
        {data?.aus.map(({ key, audio, phonetic }) => (
          <Typography
            component="div"
            key={key}
            style={{ display: "inline-block" }}
          >
            <Typography component="span">{phonetic}</Typography>
            <AudioBtn src={audio} />
          </Typography>
        ))}
      </Typography>
    ),
    uiTrans: (data) => (
      <Typography component="ul">
        {data?.trs?.map(({ pos, def }, idx) => (
          <Typography component="li" key={idx}>
            {pos && `[${pos}] `}
            {def}
          </Typography>
        ))}
      </Typography>
    ),
  },
  [OPT_DICT_YOUDAO]: {
    apiFn: apiYoudaoDict,
    toText: (data) =>
      data?.ec?.word?.trs?.map(
        ({ pos, tran }) => `${pos ? `[${pos}] ` : ""}${tran}`
      ) || [],
    uiAudio: () => null,
    uiTrans: (data) => (
      <Typography component="ul">
        {data?.ec?.word?.trs?.map(({ pos, tran }, idx) => (
          <Typography component="li" key={idx}>
            {pos && `[${pos}] `}
            {tran}
          </Typography>
        ))}
      </Typography>
    ),
  },
};
