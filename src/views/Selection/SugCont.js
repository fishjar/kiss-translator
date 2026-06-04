import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import { apiBaiduSuggest, apiYoudaoSuggest } from "../../apis";
import Stack from "@mui/material/Stack";
import { OPT_SUG_BAIDU, OPT_SUG_YOUDAO } from "../../config";
import { useAsyncNow } from "../../hooks/Fetch";

/**
 * 百度输入建议/联想词列表组件
 */
function SugBaidu({ text }) {
  // 使用 useAsyncNow 即时查询百度建议接口
  const { loading, error, data } = useAsyncNow(apiBaiduSuggest, text);

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
      {data.map(({ k, v }) => (
        <Typography component="div" key={k}>
          <Typography>{k}</Typography>
          <Typography component="ul" style={{ margin: "0" }}>
            <Typography component="li">{v}</Typography>
          </Typography>
        </Typography>
      ))}
    </>
  );
}

/**
 * 有道输入建议/联想词列表组件
 */
function SugYoudao({ text }) {
  // 使用 useAsyncNow 即时查询有道建议接口
  const { loading, error, data } = useAsyncNow(apiYoudaoSuggest, text);

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
      {data.map(({ entry, explain }) => (
        <Typography component="div" key={entry}>
          <Typography>{entry}</Typography>
          <Typography component="ul" style={{ margin: "0" }}>
            <Typography component="li">{explain}</Typography>
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
 * @param {string} props.enSug - 选择的建议联想服务类型 (OPT_SUG_BAIDU 或 OPT_SUG_YOUDAO)
 */
export default function SugCont({ text, enSug }) {
  // REVIEW: 性能和无意义实例化问题。sugMap 对象在 SugCont 每次重新 render 时都会被重新声明并实例化其中的所有子组件 React Element（例如虽然 enSug 是 "baidu"，但 SugYoudao 组件的 React Element 仍然会被隐式构建）。更推荐根据条件动态执行渲染，如：{enSug === OPT_SUG_BAIDU ? <SugBaidu text={text} /> : enSug === OPT_SUG_YOUDAO ? <SugYoudao text={text} /> : null}
  const sugMap = {
    [OPT_SUG_BAIDU]: <SugBaidu text={text} />,
    [OPT_SUG_YOUDAO]: <SugYoudao text={text} />,
  };

  return (
    <Stack spacing={1}>
      <Divider />
      {sugMap[enSug] || <Typography>Sug not support</Typography>}
    </Stack>
  );
}
