import { SettingProvider } from "../../hooks/Setting";
import ThemeProvider from "../../hooks/Theme";
import DraggableResizable from "./DraggableResizable";
import Header from "../Popup/Header";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { useI18n } from "../../hooks/I18n";
import {
  OPT_TRANS_ALL,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  DEFAULT_TRANS_APIS,
  OPT_TRANS_BAIDU,
} from "../../config";
import { useEffect, useState, useRef } from "react";
import { apiTranslate } from "../../apis";
import { isValidWord } from "../../libs/utils";

const exchangeMap = {
  word_third: "第三人称单数",
  word_ing: "现在分词",
  word_done: "过去式",
  word_past: "过去分词",
  word_pl: "复数",
  word_proto: "原词",
};

function DictCont({ dictResult }) {
  if (!dictResult) {
    return;
  }

  return (
    <Box>
      <h4>{dictResult.simple_means?.word_name}</h4>
      <p>
        {Object.entries(dictResult.simple_means?.exchange || {}).map(
          ([key, val]) => (
            <span key={key}>{`${exchangeMap[key] || key}: ${val.join(
              ","
            )}; `}</span>
          )
        )}
      </p>
      <p>
        {Object.values(dictResult.simple_means?.tags || {})
          .map((vals) => vals.join(", "))
          .join(", ")}
      </p>
      {dictResult.simple_means?.symbols?.map(({ ph_en, ph_am, parts }, idx) => (
        <div key={idx}>
          <p>{`英: [${ph_en}] 美: [${ph_am}]`}</p>
          {parts.map(({ part, means }, idx) => (
            <p key={idx}>{`[${part}]: ${means.join("; ")}`}</p>
          ))}
        </div>
      ))}
    </Box>
  );
}

function TranCont({ text, translator, fromLang, toLang, transApis }) {
  const i18n = useI18n();
  const [trText, setTrText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dictResult, setDictResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setTrText("");
        setError("");
        setDictResult(null);

        const apis = { ...transApis, ...DEFAULT_TRANS_APIS };
        const apiSetting = apis[translator];
        const tranRes = await apiTranslate({
          text,
          translator,
          fromLang,
          toLang,
          apiSetting,
        });
        setTrText(tranRes[0]);

        // 词典
        if (isValidWord(text) && toLang.startsWith("zh")) {
          if (fromLang === "en" && translator === OPT_TRANS_BAIDU) {
            setDictResult(tranRes[2]);
          } else {
            const dictRes = await apiTranslate({
              text,
              translator: OPT_TRANS_BAIDU,
              fromLang: "en",
              toLang: "zh-CN",
              apiSetting: apis[OPT_TRANS_BAIDU],
            });
            setDictResult(dictRes[2].dict_result);
          }
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [text, translator, fromLang, toLang, transApis]);

  return (
    <>
      <Box>
        <TextField
          label={i18n("translated_text")}
          fullWidth
          multiline
          value={trText}
        />
      </Box>

      {loading && <CircularProgress size={24} />}
      {error && <Alert severity="error">{error}</Alert>}
      {dictResult && <DictCont dictResult={dictResult} />}
    </>
  );
}

function TranForm({ text, setText, tranboxSetting, transApis }) {
  const i18n = useI18n();

  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState("");
  const [translator, setTranslator] = useState(tranboxSetting.translator);
  const [fromLang, setFromLang] = useState(tranboxSetting.fromLang);
  const [toLang, setToLang] = useState(tranboxSetting.toLang);
  const inputRef = useRef(null);

  return (
    <Stack sx={{ p: 2 }} spacing={2}>
      <Box>
        <Grid container spacing={2} columns={12}>
          <Grid item xs={4} sm={4} md={4} lg={4}>
            <TextField
              select
              SelectProps={{ MenuProps: { disablePortal: true } }}
              fullWidth
              size="small"
              name="fromLang"
              value={fromLang}
              label={i18n("from_lang")}
              onChange={(e) => {
                setFromLang(e.target.value);
              }}
            >
              {OPT_LANGS_FROM.map(([lang, name]) => (
                <MenuItem key={lang} value={lang}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={4} sm={4} md={4} lg={4}>
            <TextField
              select
              SelectProps={{ MenuProps: { disablePortal: true } }}
              fullWidth
              size="small"
              name="toLang"
              value={toLang}
              label={i18n("to_lang")}
              onChange={(e) => {
                setToLang(e.target.value);
              }}
            >
              {OPT_LANGS_TO.map(([lang, name]) => (
                <MenuItem key={lang} value={lang}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={4} sm={4} md={4} lg={4}>
            <TextField
              select
              SelectProps={{ MenuProps: { disablePortal: true } }}
              fullWidth
              size="small"
              value={translator}
              name="translator"
              label={i18n("translate_service")}
              onChange={(e) => {
                setTranslator(e.target.value);
              }}
            >
              {OPT_TRANS_ALL.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </Box>

      <Box>
        <TextField
          label={i18n("original_text")}
          inputRef={inputRef}
          fullWidth
          multiline
          value={editMode ? editText : text}
          disabled={!editMode}
          onChange={(e) => {
            setEditText(e.target.value);
          }}
          onClick={() => {
            setEditMode(true);
            setEditText(text);
            const timer = setTimeout(() => {
              clearTimeout(timer);
              inputRef.current?.focus();
            }, 100);
          }}
          onBlur={() => {
            setEditMode(false);
            setText(editText.trim());
          }}
        />
      </Box>

      <TranCont
        text={text}
        translator={translator}
        fromLang={fromLang}
        toLang={toLang}
        transApis={transApis}
      />
    </Stack>
  );
}

export default function TranBox({
  text,
  setText,
  setShowBox,
  tranboxSetting,
  transApis,
  boxSize,
  setBoxSize,
  boxPosition,
  setBoxPosition,
}) {
  return (
    <SettingProvider>
      <ThemeProvider>
        <DraggableResizable
          defaultPosition={boxPosition}
          defaultSize={boxSize}
          header={<Header setShowPopup={setShowBox} />}
          onChangeSize={setBoxSize}
          onChangePosition={setBoxPosition}
        >
          <Divider />
          <TranForm
            text={text}
            setText={setText}
            tranboxSetting={tranboxSetting}
            transApis={transApis}
          />
        </DraggableResizable>
      </ThemeProvider>
    </SettingProvider>
  );
}
