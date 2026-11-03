import Typography from "@mui/material/Typography";
import { AudioBtn, BaiduAudioBtn } from "./AudioBtn";
import { OPT_DICT_BING, OPT_DICT_YOUDAO } from "../../config";
import { apiMicrosoftDict, apiYoudaoDict } from "../../apis";

const translateValue = (translate, value) =>
  typeof value === "string" && value.trim() ? translate(value) : value;

// Bing inflections look like "复数: translators". Only the Chinese label is
// translated; the English word form stays as returned by the dictionary.
const bingInflection = (value) => {
  if (typeof value !== "string") return null;
  const match = value.match(/^(.*?)\s*[:：]\s*(\S.*?)$/);
  if (!match) return null;
  const label = match[1].trim();
  const form = match[2].trim();
  if (!label || !/[A-Za-z]/.test(form)) return null;
  return { label, form };
};

const bingInflectionLabel = (value) => {
  const inflection = bingInflection(value);
  if (inflection) return inflection.label;
  if (
    typeof value === "string" &&
    /[A-Za-z]/.test(value) &&
    !/[\u4e00-\u9fff]/.test(value)
  ) {
    return "";
  }
  return typeof value === "string" ? value : "";
};

const localizeBingInflection = async (value, translate) => {
  const inflection = bingInflection(value);
  if (!inflection) {
    const label = bingInflectionLabel(value);
    return label ? translateValue(translate, label) : value;
  }
  const label = await translateValue(translate, inflection.label);
  return `${label}: ${inflection.form}`;
};

/**
 * 各种英文词典的解析与渲染处理器策略映射表
 */
export const dictHandlers = {
  // ------------------ 必应词典 (Bing Dictionary) ------------------
  [OPT_DICT_BING]: {
    // 异步查询 API 函数
    apiFn: apiMicrosoftDict,
    getLocalizationValues: (data) => [
      ...(data?.trs || []).flatMap(({ pos, def }) => [pos, def]),
      ...(data?.presents || []).map(bingInflectionLabel).filter(Boolean),
      ...(data?.ecs || []).flatMap(({ lis }) => lis || []),
      ...(data?.sentences || []).slice(0, 2).map(({ chs }) => chs),
      ...((data?.ecs || []).length ? ["详细释义"] : []),
      ...((data?.sentences || []).length ? ["例句"] : []),
    ],
    // Bing's dictionary payload is English-Chinese. Translate the displayed
    // Chinese fields while preserving the headword, phonetics, and audio.
    localize: async (data, translate, { toLang } = {}) => {
      const usesChineseLabels = toLang === "zh-CN" || toLang === "zh-TW";
      const [trs, presents, ecs, sentences, detailsLabel, examplesLabel] =
        await Promise.all([
          Promise.all(
            (data?.trs || []).map(async (item) => ({
              ...item,
              pos: await translateValue(translate, item.pos),
              def: await translateValue(translate, item.def),
            }))
          ),
          Promise.all(
            (data?.presents || []).map((value) =>
              localizeBingInflection(value, translate)
            )
          ),
          Promise.all(
            (data?.ecs || []).map(async (item) => ({
              ...item,
              lis: await Promise.all(
                (item.lis || []).map((value) =>
                  translateValue(translate, value)
                )
              ),
            }))
          ),
          Promise.all(
            (data?.sentences || []).map(async (item, index) => ({
              ...item,
              chs:
                index < 2
                  ? await translateValue(translate, item.chs)
                  : item.chs,
            }))
          ),
          translate("详细释义"),
          translate("例句"),
        ]);

      return {
        ...data,
        trs,
        presents,
        ecs,
        sentences,
        ...(data?.aus && {
          aus: usesChineseLabels
            ? data.aus
            : data.aus.map((item) => ({
                ...item,
                key:
                  item.key === "英"
                    ? "UK"
                    : item.key === "美"
                      ? "US"
                      : item.key,
              })),
        }),
        labels: { details: detailsLabel, examples: examplesLabel },
      };
    },
    // 从返回数据中读取单词原型
    reWord: (data) => data?.word,
    // 将词典解释转换为纯文本数组（用于快速复制）
    toText: (data) =>
      data?.trs?.map(({ pos, def }) => `${pos ? `[${pos}] ` : ""}${def}`) || [],
    // 渲染发音部分 (包含音标及发音按钮，包含英音、美音等)
    uiAudio: (data) => (
      <Typography component="div">
        {data?.aus?.map(({ key, audio, phonetic }) => (
          <Typography
            component="div"
            key={key}
            style={{ display: "inline-block", paddingRight: "1em" }}
          >
            <Typography component="span">{`${key} [${phonetic || ""}]`}</Typography>
            {/* 音频发音按钮 */}
            <AudioBtn src={audio} />
          </Typography>
        ))}
      </Typography>
    ),
    // 渲染词典主体翻译与例句部分
    uiTrans: (data) => (
      <Typography component="div">
        {/* 词性及基本释义列表 */}
        <Typography component="ul">
          {data?.trs?.map(({ pos, def }, idx) => (
            <Typography component="li" key={idx}>
              {pos && `[${pos}] `}
              {def}
            </Typography>
          ))}
        </Typography>

        {/* 单词的时态/变形展示 */}
        {data?.presents?.length > 0 && (
          <Typography component="div" style={{ marginTop: "10px" }}>
            {data.presents.join(", ")}
          </Typography>
        )}

        {/* 英汉双解详细释义 */}
        {data?.ecs?.length > 0 && (
          <Typography component="div" style={{ marginTop: "10px" }}>
            <Typography
              component="div"
              style={{ fontWeight: "bold", marginBottom: "5px" }}
            >
              {data.labels?.details || "英汉双解"}
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

        {/* 显示相关双语例句 */}
        {data?.sentences?.length > 0 && (
          <Typography component="div" style={{ marginTop: "10px" }}>
            <Typography
              component="div"
              style={{ fontWeight: "bold", marginBottom: "5px" }}
            >
              {data.labels?.examples || "例句"}
            </Typography>
            {/* 仅截取前 2 条例句显示 */}
            {data.sentences.slice(0, 2).map((sentence, idx) => (
              <Typography
                component="div"
                key={idx}
                style={{ marginBottom: "5px" }}
              >
                {/* 英文例句中对查询单词进行高亮处理 */}
                <Typography component="div">
                  {/* REVIEW: 使用 split(data.word) 进行单词拆分高亮可能会失效，若例句中单词由于首字母大写或时态变化（例如 "Word" 或 "words"）而与 data.word 不完全相等时，将无法高亮。建议使用不区分大小写的正则匹配进行替换和高亮。 */}
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
                {/* 中文例句对照 */}
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

  // ------------------ 有道词典 (Youdao Dictionary) ------------------
  [OPT_DICT_YOUDAO]: {
    // 异步查询 API 函数
    apiFn: apiYoudaoDict,
    getLocalizationValues: (data) => {
      const sentencePairs = data?.blng_sents_part?.["sentence-pair"] || [];
      return [
        ...(data?.ec?.word?.trs || []).flatMap(({ pos, tran }) => [pos, tran]),
        ...sentencePairs
          .slice(0, 2)
          .map((item) => item["sentence-translation"]),
        ...(sentencePairs.length ? ["例句"] : []),
      ];
    },
    // Youdao exposes English-Chinese definition fields as well. Localize only
    // the fields rendered by this card and keep the source schema intact.
    localize: async (data, translate, { toLang } = {}) => {
      const usesChineseLabels = toLang === "zh-CN" || toLang === "zh-TW";
      const word = data?.ec?.word;
      const sentencePairs = data?.blng_sents_part?.["sentence-pair"];
      const [trs, localizedSentencePairs, examplesLabel] = await Promise.all([
        Promise.all(
          (word?.trs || []).map(async (item) => ({
            ...item,
            pos: await translateValue(translate, item.pos),
            tran: await translateValue(translate, item.tran),
          }))
        ),
        Promise.all(
          (sentencePairs || []).map(async (item, index) => ({
            ...item,
            "sentence-translation":
              index < 2
                ? await translateValue(translate, item["sentence-translation"])
                : item["sentence-translation"],
          }))
        ),
        translate("例句"),
      ]);

      return {
        ...data,
        ...(data?.ec && {
          ec: {
            ...data.ec,
            ...(word && { word: { ...word, trs } }),
          },
        }),
        ...(data?.blng_sents_part && {
          blng_sents_part: {
            ...data.blng_sents_part,
            ...(sentencePairs && {
              "sentence-pair": localizedSentencePairs,
            }),
          },
        }),
        labels: {
          ...data?.labels,
          examples: examplesLabel,
          pronunciationUk: usesChineseLabels ? "英" : "UK",
          pronunciationUs: usesChineseLabels ? "美" : "US",
        },
      };
    },
    // 获取原型词汇
    reWord: (data) => data?.ec?.word?.["return-phrase"],
    // 词义纯文本转换
    toText: (data) =>
      data?.ec?.word?.trs?.map(
        ({ pos, tran }) => `${pos ? `[${pos}] ` : ""}${tran}`
      ) || [],
    // 渲染英音/美音音标并调用百度 TTS 播放发音
    uiAudio: (data) => (
      <Typography component="div">
        <Typography
          component="div"
          style={{ display: "inline-block", paddingRight: "1em" }}
        >
          <Typography component="span">{`${data?.labels?.pronunciationUk || "英"} ${data?.ec?.word?.ukphone ? `[${data?.ec?.word?.ukphone}]` : ""}`}</Typography>
          <BaiduAudioBtn text={data?.ec?.word?.["return-phrase"]} lan="uk" />
        </Typography>
        <Typography
          component="div"
          style={{ display: "inline-block", paddingRight: "1em" }}
        >
          <Typography component="span">{`${data?.labels?.pronunciationUs || "美"} ${data?.ec?.word?.usphone ? `[${data?.ec?.word?.usphone}]` : ""}`}</Typography>
          <BaiduAudioBtn text={data?.ec?.word?.["return-phrase"]} lan="en" />
        </Typography>
      </Typography>
    ),
    // 渲染有道的中文翻译与例句
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

        {/* 例句显示 */}
        {data?.blng_sents_part?.["sentence-pair"]?.length > 0 && (
          <Typography component="div" style={{ marginTop: "10px" }}>
            <Typography
              component="div"
              style={{ fontWeight: "bold", marginBottom: "5px" }}
            >
              {data.labels?.examples || "例句"}
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
                    {/* 同样在英文例句中高亮当前词汇 */}
                    {/* REVIEW: 同样存在大小写不同导致 split 无法高亮的问题。 */}
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
