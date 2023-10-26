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
import IconButton from "@mui/material/IconButton";
import DoneIcon from "@mui/icons-material/Done";
import { useI18n } from "../../hooks/I18n";
import { OPT_TRANS_ALL, OPT_LANGS_FROM, OPT_LANGS_TO } from "../../config";
import { useState, useRef } from "react";
import TranCont from "./TranCont";
import CopyBtn from "./CopyBtn";

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
                    }}
                  >
                    <DoneIcon fontSize="inherit" />
                  </IconButton>
                ) : (
                  <CopyBtn text={text} />
                )}
              </Stack>
            ),
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
