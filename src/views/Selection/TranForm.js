import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import DoneIcon from "@mui/icons-material/Done";
import CircularProgress from "@mui/material/CircularProgress";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import { useI18n } from "../../hooks/I18n";
import {
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  OPT_LANGDETECTOR_ALL,
  OPT_DICT_ALL,
  OPT_SUG_ALL,
  OPT_LANGS_MAP,
  OPT_DICT_MAP,
  OPT_SUG_MAP,
} from "../../config";
import { useState, useMemo, useEffect, useRef } from "react";
import TranCont from "./TranCont";
import DictCont from "./DictCont";
import SugCont from "./SugCont";
import CopyBtn from "./CopyBtn";
import { isValidWord } from "../../libs/utils";
import { kissLog } from "../../libs/log";
import { tryDetectLang } from "../../libs/detect";
import Autocomplete from "@mui/material/Autocomplete";
import Checkbox from "@mui/material/Checkbox";

export default function TranForm({
  text,
  setText,
  apiSlugs: initApiSlugs,
  fromLang: initFromLang,
  toLang: initToLang,
  toLang2: initToLang2,
  transApis,
  simpleStyle = false,
  langDetector: initLangDetector = "-",
  enDict: initEnDict = "-",
  enSug: initEnSug = "-",
  isPlaygound = false,
}) {
  const i18n = useI18n();

  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState(text);
  const [apiSlugs, setApiSlugs] = useState(initApiSlugs);
  const [fromLang, setFromLang] = useState(initFromLang);
  const [toLang, setToLang] = useState(initToLang);
  const [toLang2, setToLang2] = useState(initToLang2);
  const [langDetector, setLangDetector] = useState(initLangDetector);
  const [enDict, setEnDict] = useState(initEnDict);
  const [enSug, setEnSug] = useState(initEnSug);
  const [deLang, setDeLang] = useState("");
  const [deLoading, setDeLoading] = useState(false);
  const [inflectionMap, setInflectionMap] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    input.focus();

    const len = input.value.length;
    input.setSelectionRange(len, len);
  }, []);

  useEffect(() => {
    if (isValidWord(text)) {
      const event = new CustomEvent("kiss-add-word", {
        detail: { word: text },
      });
      document.dispatchEvent(event);
    }
  }, [text]);

  useEffect(() => {
    if (!editMode) {
      setEditText(text);
    }
  }, [text, editMode]);

  useEffect(() => {
    if (!text.trim()) {
      setDeLang("");
      return;
    }

    (async () => {
      try {
        setDeLoading(true);
        const deLang = await tryDetectLang(text, langDetector);
        if (deLang) {
          setDeLang(deLang);
        }
      } catch (err) {
        kissLog("tranbox: detect lang", err);
      } finally {
        setDeLoading(false);
      }
    })();
  }, [text, langDetector, setDeLang, setDeLoading]);

  useEffect(() => {
    setInflectionMap(null);
    const handleInf = (e) => {
      const { word, inflectionMap, inflections } = e.detail || {};
      if (!word) return;
      if (word !== text) return;

      if (inflectionMap) {
        setInflectionMap(inflectionMap);
        return;
      }

      if (inflections && inflections.length) {
        const raw = inflections;
        const base = (word || "").toLowerCase();
        const pick = (pred) => raw.find((f) => pred((f || "").toLowerCase()));
        const map = {};
        map.present_participle = pick((s) => s.endsWith("ing"));
        map.simple_present = pick((s) => s.endsWith("s") && !s.endsWith("ss") && !s.endsWith("ing"));
        map.past_tense = pick((s) => s.endsWith("ed") || (s !== base && !s.endsWith("ing") && !s.endsWith("s")));
        const assigned = new Set(Object.values(map).filter(Boolean));
        const leftovers = raw.filter((f) => !assigned.has(f));
        if (!map.past_tense && leftovers.length) map.past_tense = leftovers[0];
        if (!map.present_participle && leftovers[1]) map.present_participle = leftovers[1];
        if (!map.simple_present && leftovers[2]) map.simple_present = leftovers[2];
        setInflectionMap(map);
      }
    };

    document.addEventListener("kiss-dict-inflections", handleInf);
    return () => document.removeEventListener("kiss-dict-inflections", handleInf);
  }, [text]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setText(text.trim());
    } catch (err) {
      //
    }
  };

  // todo: 语言变化后，realToLang引发二次翻译请求
  const realToLang = useMemo(() => {
    if (
      fromLang === "auto" &&
      toLang !== toLang2 &&
      toLang2 !== "-" &&
      deLang === toLang
    ) {
      return toLang2;
    }

    return toLang;
  }, [fromLang, toLang, toLang2, deLang]);

  const optApis = useMemo(
    () =>
      transApis
        .filter((api) => !api.isDisabled)
        .map((api) => ({
          key: api.apiSlug,
          name: api.apiName || api.apiSlug,
        })),
    [transApis]
  );

  const isWord = useMemo(() => isValidWord(text), [text]);
  const xs = useMemo(() => (isPlaygound ? 6 : 4), [isPlaygound]);
  const md = useMemo(() => (isPlaygound ? 3 : 4), [isPlaygound]);
  const toLangOptions = useMemo(
    () =>
      OPT_LANGS_TO.map(([value, label]) => ({
        value,
        label,
      })),
    []
  );
  return (
    <Stack spacing={simpleStyle ? 1 : 2}>
      {!simpleStyle && (
        <>
          <Box>
            <Grid container spacing={2} columns={12}>
              <Grid item xs={xs} md={md}>
                {/* 多选下拉框 */}
                <Autocomplete
                  multiple
                  disablePortal
                  size="small"
                  options={optApis}
                  value={optApis.filter((o) => apiSlugs.includes(o.key))}
                  getOptionLabel={(option) => option.name}
                  isOptionEqualToValue={(o, v) => o.key === v.key}
                  onChange={(e, values) => {
                    setApiSlugs(values.map((v) => v.key));
                  }}
                  renderOption={(props, option, { selected }) => (
                    <li {...props}>
                      <Checkbox checked={selected} />
                      {option.name}
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      fullWidth
                      label={i18n("translate_service_multiple")}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={xs} md={md}>
                <Autocomplete
                  disablePortal
                  size="small"
                  options={OPT_LANGS_FROM.map(([value, label]) => ({
                    value,
                    label,
                  }))}
                  value={
                    OPT_LANGS_FROM
                      .map(([value, label]) => ({ value, label }))
                      .find((o) => o.value === fromLang) || null
                  }
                  isOptionEqualToValue={(o, v) => o.value === v.value}
                  getOptionLabel={(o) => o.label}
                  onChange={(e, v) => {
                    setFromLang(v?.value ?? "auto");
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      fullWidth
                      label={i18n("from_lang")}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={xs} md={md}>
                <Autocomplete
                  disablePortal
                  size="small"
                  options={toLangOptions}
                  value={toLangOptions.find((o) => o.value === toLang) || null}
                  isOptionEqualToValue={(o, v) => o.value === v.value}
                  getOptionLabel={(o) => o.label}
                  onChange={(e, v) => {
                    setToLang(v?.value ?? "-");
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      fullWidth
                      label={i18n("to_lang")}
                    />
                  )}
                />
              </Grid>

              {isPlaygound && (
                <>
                  <Grid item xs={xs} md={md}>
                    <Autocomplete
                      disablePortal
                      size="small"
                      options={toLangOptions}
                      value={toLangOptions.find((o) => o.value === toLang2) || null}
                      isOptionEqualToValue={(o, v) => o.value === v.value}
                      getOptionLabel={(o) => o.label}
                      onChange={(e, v) => {
                        setToLang2(v?.value ?? "-");
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          fullWidth
                          label={i18n("to_lang2")}
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={xs} md={md}>
                    <TextField
                      select
                      SelectProps={{ native: true }}
                      fullWidth
                      size="small"
                      name="enDict"
                      value={enDict}
                      label={i18n("english_dict")}
                      onChange={(e) => {
                        setEnDict(e.target.value);
                      }}
                    >
                      <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                      {OPT_DICT_ALL.map((item) => (
                        <option value={item} key={item}>
                          {item}
                        </option>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={xs} md={md}>
                    <TextField
                      select
                      SelectProps={{ native: true }}
                      fullWidth
                      size="small"
                      name="enSug"
                      value={enSug}
                      label={i18n("english_suggest")}
                      onChange={(e) => {
                        setEnSug(e.target.value);
                      }}
                    >
                      <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                      {OPT_SUG_ALL.map((item) => (
                        <option value={item} key={item}>
                          {item}
                        </option>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={xs} md={md}>
                    <TextField
                      select
                      SelectProps={{ native: true }}
                      fullWidth
                      size="small"
                      name="langDetector"
                      value={langDetector}
                      label={i18n("detected_lang")}
                      onChange={(e) => {
                        setLangDetector(e.target.value);
                      }}
                    >
                      <MenuItem value={"-"}>{i18n("disable")}</MenuItem>
                      {OPT_LANGDETECTOR_ALL.map((item) => (
                        <option value={item} key={item}>
                          {item}
                        </option>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={xs} md={md}>
                    <TextField
                      fullWidth
                      size="small"
                      name="deLang"
                      value={deLang && OPT_LANGS_MAP.get(deLang)}
                      label={i18n("detected_result")}
                      disabled
                      InputProps={{
                        startAdornment: deLoading ? (
                          <CircularProgress size={16} />
                        ) : null,
                      }}
                    />
                  </Grid>
                </>
              )}
            </Grid>
          </Box>

          <Box>
            <TextField
              size="small"
              label={i18n("original_text")}
              fullWidth
              multiline
              inputRef={inputRef}
              minRows={isPlaygound ? 2 : 1}
              maxRows={10}
              value={editText}
              onChange={(e) => {
                setEditText(e.target.value);
              }}
              onFocus={() => {
                setEditMode(true);
              }}
              onBlur={() => {
                setEditMode(false);
                setText(editText.trim());
              }}
              InputProps={{
                endAdornment: (
                  <Stack
                    direction="row"
                    sx={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                    }}
                  >
                    {editMode ? (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditMode(false);
                          setText(editText.trim());
                        }}
                        title={i18n("submit")}
                      >
                        <DoneIcon fontSize="inherit" />
                      </IconButton>
                    ) : text ? (
                      <CopyBtn text={text} title={i18n("copy")} />
                    ) : (
                      <IconButton
                        size="small"
                        onClick={handlePaste}
                        title={i18n("paste")}
                      >
                        <ContentPasteIcon fontSize="inherit" />
                      </IconButton>
                    )}
                  </Stack>
                ),
              }}
            />
          </Box>
        </>
      )}

      {apiSlugs.map((slug) => (
        <TranCont
          key={slug}
          text={text}
          fromLang={fromLang}
          toLang={realToLang}
          simpleStyle={simpleStyle}
          apiSlug={slug}
          transApis={transApis}
        />
      ))}

      {isWord && OPT_DICT_MAP.has(enDict) && (
        <DictCont text={text} enDict={enDict} />
      )}

      {isWord && OPT_SUG_MAP.has(enSug) && (
        <SugCont text={text} enSug={enSug} />
      )}

      {inflectionMap && (
        <div style={{ padding: "6px 8px", marginTop: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>词形变化</div>
          <div style={{ fontSize: 13, color: "", lineHeight: 1.6 }}>
            {inflectionMap.past_tense && (
              <span style={{ marginRight: 12 }}>Past Tense：{inflectionMap.past_tense}</span>
            )}
            {inflectionMap.present_participle && (
              <span style={{ marginRight: 12 }}>Present Participle：{inflectionMap.present_participle}</span>
            )}
            {inflectionMap.simple_present && (
              <span style={{ marginRight: 12 }}>Simple Present：{inflectionMap.simple_present}</span>
            )}
          </div>
        </div>
      )}
    </Stack>
  );
}
