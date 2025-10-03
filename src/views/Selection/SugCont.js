import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import { apiBaiduSuggest, apiYoudaoSuggest } from "../../apis";
import Stack from "@mui/material/Stack";
import { OPT_SUG_BAIDU, OPT_SUG_YOUDAO } from "../../config";
import { useAsyncNow } from "../../hooks/Fetch";

function SugBaidu({ text }) {
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

function SugYoudao({ text }) {
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

export default function SugCont({ text, enSug }) {
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
