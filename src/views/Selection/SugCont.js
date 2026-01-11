import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import { apiBaiduSuggest, apiYoudaoSuggest } from "../../apis";
import { OPT_SUG_BAIDU, OPT_SUG_YOUDAO } from "../../config";
import { useAsyncNow } from "../../hooks/Fetch";

function SugBaidu({ text }) {
  const { loading, error, data } = useAsyncNow(apiBaiduSuggest, text);
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const titleColor = '#48A3FF';
  const entryColor = isDarkMode ? '#1e88e5' : '#007BF7';
  const bgColor = isDarkMode
    ? 'rgba(147, 197, 253, 0.05)'
    : 'rgba(147, 197, 253, 0.12)';

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 1 }}>
        <CircularProgress size={16} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        sx={{
          fontSize: 12,
          py: 0.5,
          "& .MuiAlert-message": { padding: 0 }
        }}
      >
        {error.message}
      </Alert>
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <Box>
      <Typography
        component="div"
        sx={{
          fontSize: 12,
          fontWeight: 600,
          color: titleColor,
          marginBottom: 1,
          paddingBottom: 0.5,
          borderBottom: "1px solid rgba(72, 163, 255, 0.2)",
        }}
      >
        百度相关
      </Typography>

      {data.map(({ k, v }) => (
        <Box
          key={k}
          sx={{
            mb: 1.5,
            py: 0.5,
            px: 0,
            backgroundColor: bgColor,
            borderRadius: 5.25,
          }}
        >
          <Typography
            component="div"
            sx={{
              fontSize: 12,
              fontWeight: 600,
              color: entryColor,
              lineHeight: 1.2,
            }}
          >
            {k}
          </Typography>
          {v && (
            <Typography
              component="div"
              sx={{
                fontSize: 11,
                lineHeight: 1.1,
                color: "text.primary",
              }}
            >
              {v}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

function SugYoudao({ text, onWordClick }) {
  const { loading, error, data } = useAsyncNow(apiYoudaoSuggest, text);
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const titleColor = isDarkMode ? '#93c5fd' : '#48A3FF' ;
  const entryColor = isDarkMode ? '#1e88e5' : '#007BF7';
  const bgColor = isDarkMode
    ? 'rgba(147, 197, 253, 0.05)'
    : 'rgba(147, 197, 253, 0.12)';

  const textColor = isDarkMode
    ? 'rgba(255, 255, 255, 0.82)'
    : 'rgba(0, 0, 0, 0.87)';

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 1 }}>
        <CircularProgress size={16} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        sx={{
          fontSize: 12,
          py: 0.5,
          "& .MuiAlert-message": { padding: 0 }
        }}
      >
        {error.message}
      </Alert>
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <Box>
      <Typography
        component="div"
        sx={{
          fontSize: 13,
          fontWeight: 600,
          color: titleColor,
          marginBottom: 1,
          paddingBottom: 0.5,
          borderBottom: "1px solid rgba(72, 163, 255, 0.2)",
        }}
      >
        相关词汇
      </Typography>

      {data.slice(0, 3).map(({ entry, explain }) => {
        const explainParts = explain?.split("\n") || [];
        const meaning = explainParts[0]?.trim() || "";

        return (
          <Box
            key={entry}
            sx={{
              mb: 1.5,
              py: 0.5,
              px: 0,
              backgroundColor: bgColor,
              borderRadius: 5.25,
              padding: "8px 10px",
            }}
          >
            <Typography
              component="div"
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: entryColor,
                lineHeight: 1.2,
                marginBottom: 0.5,
              }}
            >
              {entry}
            </Typography>

            {meaning && (
              <Typography
                component="div"
                sx={{
                  fontSize: 12,
                  lineHeight: 1.1,
                  color: textColor,
                  paddingLeft: 0,
                }}
              >
                {meaning}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

export default function SugCont({ text, enSug, onWordClick }) {
  const sugMap = {
    [OPT_SUG_BAIDU]: <SugBaidu text={text} />,
    [OPT_SUG_YOUDAO]: <SugYoudao text={text} onWordClick={onWordClick} />,
  };

  if (!sugMap[enSug]) {
    return null;
  }

  return (
    <Box sx={{ mt: 1, width: "100%" }}>
      {sugMap[enSug]}
    </Box>
  );
}