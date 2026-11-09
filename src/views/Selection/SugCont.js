import { useEffect, useMemo, useState } from "react";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import { apiBaiduSuggest, apiYoudaoSuggest } from "../../apis";
import Stack from "@mui/material/Stack";
import { OPT_SUG_BAIDU, OPT_SUG_YOUDAO } from "../../config";
import { useAsyncNow } from "../../hooks/Fetch";
import { loadDictionary } from "./loadDictionary";

function SugProvider({ text, serviceId }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    let call;
    setState({ loading: true });
    import("../../providers/savedService")
      .then(async ({ invokeSavedService }) => {
        if (!active) return;
        call = invokeSavedService(serviceId, "suggest", { text });
        const result = await call.result;
        if (active) setState({ items: result.items });
      })
      .catch((error) => {
        if (active) setState({ error: error.message });
      });
    return () => {
      active = false;
      call?.cancel();
    };
  }, [text, serviceId]);
  if (state.loading) return <CircularProgress size={16} />;
  if (state.error) return <Alert severity="error">{state.error}</Alert>;
  return (state.items || []).map((item, index) => (
    <Typography key={index}>{item}</Typography>
  ));
}

const createSuggestionHandler = (apiFn, wordKey, definitionKey) => ({
  apiFn,
  wordKey,
  definitionKey,
  getLocalizationValues: (data) => data.map((item) => item[definitionKey]),
  localize: (data, translate) =>
    data.map((item) => ({
      ...item,
      [definitionKey]: translate(item[definitionKey]),
    })),
});

const suggestionHandlers = {
  [OPT_SUG_BAIDU]: createSuggestionHandler(apiBaiduSuggest, "k", "v"),
  [OPT_SUG_YOUDAO]: createSuggestionHandler(
    apiYoudaoSuggest,
    "entry",
    "explain"
  ),
};

function SugBody({ text, dict, toLang, apiSetting, translateVariants }) {
  const query = useMemo(
    () => ({ dict, text, toLang, apiSetting, translateVariants }),
    [dict, text, toLang, apiSetting, translateVariants]
  );
  const { loading, error, data } = useAsyncNow(loadDictionary, query);

  if (loading) {
    return <CircularProgress size={16} />;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!data) {
    return null;
  }

  return (
    <>
      {data.map((item) => (
        <Typography component="div" key={item[dict.wordKey]}>
          <Typography>{item[dict.wordKey]}</Typography>
          <Typography component="ul" style={{ margin: "0" }}>
            <Typography component="li">{item[dict.definitionKey]}</Typography>
          </Typography>
        </Typography>
      ))}
    </>
  );
}

/**
 * 输入联想面板容器组件
 *
 * @param {Object} props
 * @param {string} props.text - 当前输入的搜索文本
 * @param {string} props.enSug - 建议联想服务，内置为百度/有道，也可以是已保存的自定义服务
 * @param {string} props.toLang - 实际目标语言，包含自动切换的第二目标语言
 * @param {Object} props.apiSetting - 用于翻译联想词释义的翻译服务
 * @param {boolean} props.translateVariants - 是否把中文变体视为不同语言
 */
export default function SugCont({
  text,
  enSug,
  toLang,
  apiSetting,
  translateVariants = true,
}) {
  const dict = suggestionHandlers[enSug];

  return (
    <Stack spacing={1}>
      <Divider />
      {dict ? (
        <SugBody
          key={`${enSug}\u0000${text}\u0000${toLang || ""}\u0000${apiSetting?.apiSlug || ""}\u0000${translateVariants}`}
          text={text}
          dict={dict}
          toLang={toLang}
          apiSetting={apiSetting}
          translateVariants={translateVariants}
        />
      ) : enSug && enSug !== "-" ? (
        <SugProvider text={text} serviceId={enSug} />
      ) : null}
    </Stack>
  );
}
