import { useEffect, useState } from "react";
import {
  Typography,
  Stack,
  Divider,
  CircularProgress,
  Box,
} from "@mui/material";
import { apiZdic } from "../../apis/zdic";
import { AudioBtn } from "./AudioBtn";

export default function Zdic({ text }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!text) return;

    let active = true;
    setLoading(true);

    apiZdic(text)
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.error("获取汉典数据失败:", err);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [text]);

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" py={2}>
        <CircularProgress size={24} />
      </Stack>
    );
  }

  if (!data) {
    return (
      <Stack spacing={1}>
        <Typography variant="subtitle1" style={{ fontWeight: "bold" }}>
          {text}
        </Typography>
        <Divider />
        <Typography variant="body2" color="text.secondary">
          暂无字典数据或查询失败
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1" style={{ fontWeight: "bold" }}>
        {data.text}
      </Typography>
      <Divider />

      {(data.bushou || data.wubi) && (
        <Typography variant="body2" color="text.secondary">
          {data.bushou && `[部首]: ${data.bushou}  `}
          {data.wubi && `[五笔]: ${data.wubi}`}
        </Typography>
      )}

      {(data.fanti || data.yiti) && (
        <Typography variant="body2" color="text.secondary">
          {data.fanti && `[繁体]: ${data.fanti}  `}
          {data.yiti && `[异体]: ${data.yiti}`}
        </Typography>
      )}

      {data.results && data.results.length > 0 && (
        <Stack spacing={1} mt={1}>
          {data.results.map((res, idx) => (
            <Box key={idx}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography
                  variant="body2"
                  color="primary"
                  style={{ fontWeight: "bold" }}
                >
                  [{res.pinyin}]
                </Typography>
                {res.audioUrl && <AudioBtn src={res.audioUrl} />}
              </Stack>
              <Box component="ol" sx={{ pl: 3, m: 0, mt: 0.5 }}>
                {res.definitions &&
                  res.definitions.map((def, i) => (
                    <Typography
                      component="li"
                      key={i}
                      variant="body2"
                      sx={{ mb: 0.5 }}
                    >
                      {def}
                    </Typography>
                  ))}
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      {(data.en || data.de || data.fr) && (
        <Stack spacing={0.5} mt={1}>
          {data.en && (
            <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
              [英]: {data.en}
            </Typography>
          )}
          {data.de && (
            <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
              [德]: {data.de}
            </Typography>
          )}
          {data.fr && (
            <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
              [法]: {data.fr}
            </Typography>
          )}
        </Stack>
      )}
    </Stack>
  );
}
