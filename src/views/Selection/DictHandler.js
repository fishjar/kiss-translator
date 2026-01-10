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
      <Typography component="div" sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
        {data?.aus?.map(({ key, audio, phonetic }) => (
          <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, paddingRight: 8 }}>
            <Typography component="span" sx={{ fontSize: 13, color: 'rgba(255,255,255,0.92)', fontWeight: 600 }}>{key}</Typography>
            <Typography component="span" sx={{ fontSize: 13, color: 'rgba(255,255,255,0.78)' }}>{phonetic ? `[${phonetic}]` : ''}</Typography>
            <AudioBtn src={audio} />
          </span>
        ))}
      </Typography>
    ),
    uiTrans: (data) => (
      <Typography component="div">
        <Typography component="div" sx={{ mt: 0.5 }}>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {data?.trs?.map(({ pos, def }, idx) => (
              <li key={idx} style={{ marginBottom: 8, lineHeight: 1.45, color: 'rgba(255,255,255,0.92)', fontSize: 14 }}>
                {pos ? (
                  <span style={{ color: '#93c5fd', fontWeight: 600, marginRight: 6 }}>[{pos}]</span>
                ) : null}
                <span style={{ color: 'rgba(255,255,255,0.92)' }}>{def}</span>
              </li>
            ))}
          </ul>

          {/*词形变化*/}
          {data?.inflections?.length > 0 && (
            <div style={{ marginTop: 10, marginBottom: 10 }}>
              <div style={{ fontStyle: 'italic', fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#48A3FF' }}>词形变化</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {data.inflections.map((item, idx) => (
                  <span key={idx} style={{ padding: '6px 14px', borderRadius: 12, background: 'rgba(26,115,232,0.08)', border: '1px solid rgba(26,115,232,0.14)', color: '#48A3FF', fontSize: 13 }}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 英汉双解 */}
          {data?.ecs?.length > 0 && (
            <Typography component="div" style={{ marginTop: "6px" }}>
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