import Typography from "@mui/material/Typography";
import { AudioBtn, BaiduAudioBtn } from "./AudioBtn";
import { OPT_DICT_BING, OPT_DICT_YOUDAO } from "../../config";
import { apiMicrosoftDict, apiYoudaoDict } from "../../apis";

export const dictHandlers = {
  [OPT_DICT_BING]: {
    apiFn: apiMicrosoftDict,
    reWord: (data) => data?.word,
    toText: (data) =>
      data?.trs?.map(({ pos, def }) => `${pos ? `${pos} ` : ""}${def}`) || [],
    uiAudio: (data, isDarkMode = false) => (
      <Typography component="div" sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
        {data?.aus?.map(({ key, audio, phonetic }) => (
          <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, paddingRight: 8 }}>
            <Typography component="span" sx={{ 
              fontSize: 13, 
              color: isDarkMode ? 'rgba(255, 255, 255, 0.82)' : 'text.primary',
              fontWeight: 600 
            }}>{key}</Typography>
            <Typography component="span" sx={{ 
              fontSize: 13, 
              color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary'
            }}>{phonetic ? `[${phonetic}]` : ''}</Typography>
            <AudioBtn src={audio} />
          </span>
        ))}
      </Typography>
    ),
    uiTrans: (data, isDarkMode = false) => {
      const posColor = isDarkMode
        ? '#93c5fd'
        : '#48A3FF';
      const bgColor = isDarkMode
        ? 'rgba(147, 197, 253, 0.05)'
        : 'rgba(147, 197, 253, 0.12)';
      const textColor = isDarkMode
        ? 'rgba(255, 255, 255, 0.82)'
        : 'rgba(0, 0, 0, 0.87)';
      
      return (
        <Typography component="div">
          <Typography component="div" sx={{ mt: 0.5 }}>
            {/* 主要释义 */}
            <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'none' }}>
              {data?.trs?.map(({ pos, def }, idx) => (
                <li key={idx} style={{ marginBottom: 2, lineHeight: 1.45, color: textColor, fontSize: 14 }}>
                  {pos ? (
                    <span style={{ color: posColor, fontWeight: 550, marginRight: 6, fontSize: 13 }}>{pos}</span>
                  ) : null}
                  <span style={{ color: textColor }}>{def}</span>
                </li>
              ))}
            </ul>

            {/* 词形变化 */}
            {data?.inflections?.length > 0 && (
              <div style={{ marginTop: 10, marginBottom: 10 }}>
                <div style={{ 
                  fontStyle: 'italic', 
                  fontSize: 13, 
                  fontWeight: 600, 
                  marginBottom: 2, 
                  color: isDarkMode ? '#93c5fd' : '#48A3FF'  
                }}>词形变化</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  {data.inflections.map((item, idx) => (
                    <span key={idx} style={{ 
                      padding: '6px 14px', 
                      borderRadius: 12, 
                      backgroundColor: 'action.hover', 
                      border: '1px solid rgba(26,115,232,0.14)', 
                      color: isDarkMode ? '#93c5fd' : '#48A3FF',  
                      fontSize: 13 
                    }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 英汉双解 */}
            {data?.ecs?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ 
                  fontSize: 13, 
                  fontWeight: 600, 
                  color: isDarkMode ? '#93c5fd' : '#48A3FF', 
                  marginBottom: 6, 
                  borderBottom: '1px solid rgba(72, 163, 255, 0.2)', 
                  paddingBottom: 2 
                }}>
                  英汉双解
                </div>
                {data.ecs.map(({ pos, lis }, ecIndex) => (
                  <div key={ecIndex} style={{ marginBottom: 2 }}>
                    {pos && (
                      <div style={{ color: posColor, fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                        {pos}
                      </div>
                    )}
                    {lis.map((item, idx) => (
                      <div key={idx} style={{
                        marginBottom: 6,
                        padding: 8,
                        backgroundColor: bgColor,
                        borderRadius: 21
                      }}>
                        <div style={{
                          marginBottom: 4,
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: textColor
                        }}>
                          {item}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* 显示例句 */}
            {data?.sentences?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ 
                  fontSize: 13, 
                  fontWeight: 600, 
                  color: isDarkMode ? '#93c5fd' : '#48A3FF', 
                  marginBottom: 6, 
                  borderBottom: '1px solid rgba(72, 163, 255, 0.2)', 
                  paddingBottom: 2 
                }}>
                  例句
                </div>
                {data.sentences.slice(0, 2).map((sentence, idx) => (
                  <div key={idx} style={{ marginBottom: 10, padding: 8, backgroundColor: bgColor, borderRadius: 21 }}>
                    <div style={{ marginBottom: 6, fontSize: 13, lineHeight: 1.5, color: textColor }}>
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
                    </div>
                    <div style={{ 
                      color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)', 
                      fontSize: 12, 
                      lineHeight: 1.4, 
                      fontStyle: "italic" 
                    }}>
                      {sentence.chs}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Typography>
        </Typography>
      );
    },
  },
  [OPT_DICT_YOUDAO]: {
    apiFn: apiYoudaoDict,
    reWord: (data) => data?.ec?.word?.["return-phrase"],
    toText: (data) =>
      data?.ec?.word?.trs?.map(
        ({ pos, tran }) => `${pos ? `${pos} ` : ""}${tran}`
      ) || [],
    uiAudio: (data, isDarkMode = false) => {
      const textColor = isDarkMode
        ? 'rgba(255, 255, 255, 0.82)'  // 柔白色
        : '#000000';

      return (
        <Typography component="div">
          <Typography
            component="div"
            style={{ display: "inline-block", paddingRight: "1em" }}
          >
            <Typography
              component="span"
              style={{
                color: textColor,
                fontSize: 13
              }}
            >
              {`英 ${data?.ec?.word?.ukphone ? `[${data?.ec?.word?.ukphone}]` : ""}`}
            </Typography>
            <BaiduAudioBtn text={data?.ec?.word?.["return-phrase"]} lan="uk" />
          </Typography>
          <Typography
            component="div"
            style={{ display: "inline-block", paddingRight: "1em" }}
          >
            <Typography
              component="span"
              style={{
                color: textColor,
                fontSize: 13
              }}
            >
              {`美 ${data?.ec?.word?.usphone ? `[${data?.ec?.word?.usphone}]` : ""}`}
            </Typography>
            <BaiduAudioBtn text={data?.ec?.word?.["return-phrase"]} lan="en" />
          </Typography>
        </Typography>
      );
    },
    uiTrans: (data, isDarkMode = false) => {
      const posColor = isDarkMode
        ? '#93c5fd'
        : '#48A3FF';
      const bgColor = isDarkMode
        ? 'rgba(147, 197, 253, 0.05)'
        : 'rgba(147, 197, 253, 0.12)';
      const textColor = isDarkMode
        ? 'rgba(255, 255, 255, 0.82)'
        : 'rgba(0, 0, 0, 0.87)';
      const secondaryTextColor = isDarkMode
        ? 'rgba(255, 255, 255, 0.6)'
        : 'rgba(0, 0, 0, 0.6)';
      
      return (
        <Typography component="div">
          {/* 主要释义 */}
          <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'none' }}>
            {data?.ec?.word?.trs?.map(({ pos, tran }, idx) => (
              <li key={idx} style={{ 
                marginBottom: 2, 
                lineHeight: 1.45, 
                color: textColor,
                fontSize: 14 
              }}>
                {pos && <span style={{ color: posColor, fontWeight: 600, marginRight: 6 }}>{pos}</span>}
                {tran}
              </li>
            ))}
          </ul>

          {/* 显示例句 */}
          {data?.blng_sents_part?.["sentence-pair"]?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ 
                fontSize: 13, 
                fontWeight: 600, 
                color: isDarkMode ? '#93c5fd' : '#48A3FF',
                marginBottom: 6, 
                borderBottom: '1px solid rgba(72, 163, 255, 0.2)', 
                paddingBottom: 2 
              }}>
                例句
              </div>
              {data.blng_sents_part["sentence-pair"]
                .slice(0, 2)
                .map((sentence, idx) => (
                  <div key={idx} style={{ marginBottom: 10, padding: 8, backgroundColor: bgColor, borderRadius: 21 }}>
                    <div style={{ marginBottom: 6, fontSize: 13, lineHeight: 1.5, color: textColor }}>
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
                    </div>
                    <div style={{ 
                      color: secondaryTextColor,
                      fontSize: 12, 
                      lineHeight: 1.4, 
                      fontStyle: "italic" 
                    }}>
                      {sentence["sentence-translation"]}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Typography>
      );
    },
  },
};