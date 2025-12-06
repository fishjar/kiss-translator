import Typography from "@mui/material/Typography";
import { AudioBtn, BaiduAudioBtn } from "./AudioBtn";
import { OPT_DICT_BING, OPT_DICT_YOUDAO } from "../../config";
import { apiMicrosoftDict, apiYoudaoDict } from "../../apis";

export const dictHandlers = {
  [OPT_DICT_BING]: {
    apiFn: apiMicrosoftDict,
    reWord: (data) => data?.word,
    toText: (data) =>
      data?.trs?.map(({ pos, def }) => `${pos ? `[${pos}] ` : ""}${def}`) || [],
    uiAudio: (data) => (
      <Typography component="div">
        {data?.aus?.map(({ key, audio, phonetic }) => (
          <Typography
            component="div"
            key={key}
            style={{ display: "inline-block", paddingRight: "1em" }}
          >
            <Typography component="span">{`${key} [${phonetic || ""}]`}</Typography>
            <AudioBtn src={audio} />
          </Typography>
        ))}
      </Typography>
    ),
    uiTrans: (data) => (
      <Typography component="div">
        <Typography component="ul">
          {data?.trs?.map(({ pos, def }, idx) => (
            <Typography component="li" key={idx}>
              {pos && `[${pos}] `}
              {def}
            </Typography>
          ))}
        </Typography>

        {/* 英汉双解 */}
        {data?.ecs?.length > 0 && (
          <Typography component="div" style={{ marginTop: "10px" }}>
            <Typography
              component="div"
              style={{ fontWeight: "bold", marginBottom: "5px" }}
            >
              英汉双解
            </Typography>
            {data.ecs.map(({ pos, lis }) => (
              <Typography component="div" key={pos}>
                <Typography component="div">{pos}</Typography>
                <Typography component="ul">
                  {lis.map((item, idx) => (
                    <Typography component="li" key={idx}>
                      {item}
                    </Typography>
                  ))}
                </Typography>
              </Typography>
            ))}
          </Typography>
        )}

        {/* 显示例句 */}
        {data?.sentences?.length > 0 && (
          <Typography component="div" style={{ marginTop: "10px" }}>
            <Typography
              component="div"
              style={{ fontWeight: "bold", marginBottom: "5px" }}
            >
              例句
            </Typography>
            {data.sentences.slice(0, 2).map((sentence, idx) => (
              <Typography
                component="div"
                key={idx}
                style={{ marginBottom: "5px" }}
              >
                <Typography component="div">
                  {sentence.eng?.split(data.word)?.map((part, i, arr) => (
                    <span key={i}>
                      {i > 0 && (
                        <span style={{ fontWeight: "bold", color: "#1e88e5" }}>
                          {data.word}
                        </span>
                      )}
                      {part}
                    </span>
                  ))}
                </Typography>
                <Typography
                  component="div"
                  style={{ opacity: "0.6", fontStyle: "italic" }}
                >
                  {sentence.chs}
                </Typography>
              </Typography>
            ))}
          </Typography>
        )}
      </Typography>
    ),
  },
  [OPT_DICT_YOUDAO]: {
    apiFn: apiYoudaoDict,
    reWord: (data) => data?.ec?.word?.["return-phrase"],
    toText: (data) =>
      data?.ec?.word?.trs?.map(
        ({ pos, tran }) => `${pos ? `[${pos}] ` : ""}${tran}`
      ) || [],
    uiAudio: (data) => (
      <Typography component="div">
        <Typography
          component="div"
          style={{ display: "inline-block", paddingRight: "1em" }}
        >
          <Typography component="span">{`英 ${data?.ec?.word?.ukphone ? `[${data?.ec?.word?.ukphone}]` : ""}`}</Typography>
          <BaiduAudioBtn text={data?.ec?.word?.["return-phrase"]} lan="uk" />
        </Typography>
        <Typography
          component="div"
          style={{ display: "inline-block", paddingRight: "1em" }}
        >
          <Typography component="span">{`美 ${data?.ec?.word?.usphone ? `[${data?.ec?.word?.usphone}]` : ""}`}</Typography>
          <BaiduAudioBtn text={data?.ec?.word?.["return-phrase"]} lan="en" />
        </Typography>
      </Typography>
    ),
    uiTrans: (data) => (
      <Typography component="div">
        <Typography component="ul">
          {data?.ec?.word?.trs?.map(({ pos, tran }, idx) => (
            <Typography component="li" key={idx}>
              {pos && `[${pos}] `}
              {tran}
            </Typography>
          ))}
        </Typography>

        {/* 显示例句 */}
        {data?.blng_sents_part?.["sentence-pair"]?.length > 0 && (
          <Typography component="div" style={{ marginTop: "10px" }}>
            <Typography
              component="div"
              style={{ fontWeight: "bold", marginBottom: "5px" }}
            >
              例句
            </Typography>
            {data.blng_sents_part["sentence-pair"]
              .slice(0, 2)
              .map((sentence, idx) => (
                <Typography
                  component="div"
                  key={idx}
                  style={{ marginBottom: "5px" }}
                >
                  <Typography component="div">
                    {sentence.sentence
                      ?.split(data.ec?.word?.["return-phrase"])
                      ?.map((part, i, arr) => (
                        <span key={i}>
                          {i > 0 && data.ec?.word?.["return-phrase"] && (
                            <span
                              style={{ fontWeight: "bold", color: "#1e88e5" }}
                            >
                              {data.ec.word["return-phrase"]}
                            </span>
                          )}
                          {part}
                        </span>
                      ))}
                  </Typography>
                  <Typography
                    component="div"
                    style={{ opacity: "0.6", fontStyle: "italic" }}
                  >
                    {sentence["sentence-translation"]}
                  </Typography>
                </Typography>
              ))}
          </Typography>
        )}
      </Typography>
    ),
  },
};
