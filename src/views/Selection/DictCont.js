import { useState, useEffect, useMemo } from "react";
import Stack from "@mui/material/Stack";
import FavBtn from "./FavBtn";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import CopyBtn from "./CopyBtn";
import { useAsyncNow } from "../../hooks/Fetch";
import { dictHandlers } from "./DictHandler";
import { useI18n } from "../../hooks/I18n";

/**
 * 词典释义主体渲染组件
 *
 * @param {Object} props
 * @param {string} props.text - 查询词汇文本
 * @param {Function} props.setCopyText - 设置复制文本内容的回调
 * @param {Function} props.setRealWord - 记录词典中解析出来的真实词形原型
 * @param {Object} props.dict - 当前选中的词典处理器配置项
 */
function DictBody({ text, setCopyText, setRealWord, dict }) {
  // 使用 useAsyncNow 发起即时的异步词典查询请求
  const { loading, error, data } = useAsyncNow(dict.apiFn, text);

  // 当词典查询数据返回后，触发对原形词及待复制内容的回调更新
  useEffect(() => {
    if (!data) {
      return;
    }

    // REVIEW: 潜在的异步竞态问题。若 text 或 dict 发生变化，在 useAsyncNow 还没有返回新 data 的加载期间 (loading 为 true，data 仍是旧值)，这个 useEffect 可能会由于 text / dict 依赖改变而提早触发，导致将旧的 data 数据应用在新的 text 上产生错误的合并。建议在此处增加对于 data 是否匹配当前查询 text 的安全校验。
    const realWord = dict.reWord(data) || text;
    const copyText = [realWord, dict.toText(data).join("\n")].join("\n");
    setRealWord(realWord);
    setCopyText(copyText);
  }, [data, text, dict, setCopyText, setRealWord]);

  // 计算音频及翻译组件的渲染节点
  const uiAudio = useMemo(() => dict.uiAudio(data), [data, dict]);
  const uiTrans = useMemo(() => dict.uiTrans(data), [data, dict]);

  if (loading) {
    return <CircularProgress size={16} />;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!data) {
    return <Typography>Not found!</Typography>;
  }

  return (
    <Typography component="div">
      {uiAudio}
      {uiTrans}
    </Typography>
  );
}

/**
 * 词典整体外壳容器组件 (管理复制、收藏生词及词条顶栏)
 *
 * @param {Object} props
 * @param {string} props.text - 输入查询的单词或文本
 * @param {string} props.enDict - 选用的词典服务标识 (例如 "bing", "youdao")
 */
export default function DictCont({ text, enDict }) {
  const i18n = useI18n();
  const [copyText, setCopyText] = useState(text);
  const [realWord, setRealWord] = useState(text);
  // 获取词典匹配处理器
  const dict = dictHandlers[enDict];

  return (
    <Stack spacing={1}>
      {text && (
        <Stack direction="row" justifyContent="space-between">
          {/* 显示还原原形后的词语标题 */}
          <Typography variant="subtitle1" style={{ fontWeight: "bold" }}>
            {realWord}
          </Typography>
          <Stack direction="row" justifyContent="space-between">
            {/* 复制按钮 */}
            <CopyBtn text={copyText} title={i18n("copy")} />
            {/* 收藏生词按钮 */}
            <FavBtn word={realWord} title={i18n("collect")} />
          </Stack>
        </Stack>
      )}

      <Divider />

      {/* 词典渲染主体 */}
      {dict && (
        <DictBody
          text={text}
          setCopyText={setCopyText}
          setRealWord={setRealWord}
          dict={dict}
        />
      )}
    </Stack>
  );
}
