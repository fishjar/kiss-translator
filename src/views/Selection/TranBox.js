import { SettingProvider } from "../../hooks/Setting";
import ThemeProvider from "../../hooks/Theme";
import DraggableResizable from "./DraggableResizable";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import DoneIcon from "@mui/icons-material/Done";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import CloseIcon from "@mui/icons-material/Close";
import { useI18n } from "../../hooks/I18n";
import {
  OPT_TRANS_ALL,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  DEFAULT_TRANS_APIS,
} from "../../config";
import { useState, useRef, useMemo } from "react";
import TranCont from "./TranCont";
import DictCont from "./DictCont";
import SugCont from "./SugCont";
import CopyBtn from "./CopyBtn";
import { isValidWord } from "../../libs/utils";
import { isMobile } from "../../libs/mobile";

function Header({
  setShowPopup,
  simpleStyle,
  setSimpleStyle,
  hideClickAway,
  setHideClickAway,
  followSelection,
  setFollowSelection,
  mouseHover,
}) {
  if (!isMobile && simpleStyle && !mouseHover) {
    return;
  }

  return (
    <Box
      className="KT-transbox-header"
      onMouseUp={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <DragIndicatorIcon fontSize="small" />
        <Stack direction="row" alignItems="center">
          <IconButton
            size="small"
            onClick={() => {
              setHideClickAway((pre) => !pre);
            }}
          >
            {hideClickAway ? (
              <LockOpenIcon fontSize="small" />
            ) : (
              <LockIcon fontSize="small" />
            )}
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
              setFollowSelection((pre) => !pre);
            }}
          >
            {followSelection ? (
              <PushPinOutlinedIcon fontSize="small" />
            ) : (
              <PushPinIcon fontSize="small" />
            )}
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
              setSimpleStyle((pre) => !pre);
            }}
          >
            {simpleStyle ? (
              <UnfoldMoreIcon fontSize="small" />
            ) : (
              <UnfoldLessIcon fontSize="small" />
            )}
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
              setShowPopup(false);
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>
      <Divider />
    </Box>
  );
}

function TranForm({
  text,
  setText,
  tranboxSetting,
  transApis,
  simpleStyle,
  langDetector,
  enDict,
}) {
  const i18n = useI18n();

  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState("");
  const [translator, setTranslator] = useState(tranboxSetting.translator);
  const [fromLang, setFromLang] = useState(tranboxSetting.fromLang);
  const [toLang, setToLang] = useState(tranboxSetting.toLang);
  const inputRef = useRef(null);

  const optApis = useMemo(
    () =>
      OPT_TRANS_ALL.map((key) => ({
        ...(transApis[key] || DEFAULT_TRANS_APIS[key]),
        apiKey: key,
      }))
        .filter((item) => !item.isDisabled)
        .map(({ apiKey, apiName }) => ({
          key: apiKey,
          name: apiName?.trim() || apiKey,
        })),
    [transApis]
  );

  return (
    <Stack
      className="KT-transbox-container"
      sx={{ p: simpleStyle ? 1 : 2 }}
      spacing={simpleStyle ? 1 : 2}
    >
      {!simpleStyle && (
        <>
          <Box className="KT-transbox-select">
            <Grid container spacing={simpleStyle ? 1 : 2} columns={12}>
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
                  {optApis.map(({ key, name }) => (
                    <MenuItem key={key} value={key}>
                      {name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
          </Box>

          <Box className="KT-transbox-origin">
            <TextField
              size="small"
              label={i18n("original_text")}
              inputRef={inputRef}
              fullWidth
              multiline
              value={editMode ? editText : text}
              onChange={(e) => {
                setEditText(e.target.value);
              }}
              onFocus={() => {
                setEditMode(true);
                setEditText(text);
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
        </>
      )}

      {(!simpleStyle ||
        !isValidWord(text) ||
        !toLang.startsWith("zh") ||
        enDict === "-") && (
        <TranCont
          text={text}
          translator={translator}
          fromLang={fromLang}
          toLang={toLang}
          toLang2={tranboxSetting.toLang2}
          transApis={transApis}
          simpleStyle={simpleStyle}
          langDetector={langDetector}
        />
      )}

      {enDict !== "-" && (
        <>
          <DictCont text={text} />
          <SugCont text={text} />
        </>
      )}
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
  simpleStyle,
  setSimpleStyle,
  hideClickAway,
  setHideClickAway,
  followSelection,
  setFollowSelection,
  extStyles,
  langDetector,
  enDict,
}) {
  const [mouseHover, setMouseHover] = useState(false);
  return (
    <SettingProvider>
      <ThemeProvider styles={extStyles}>
        <DraggableResizable
          position={boxPosition}
          size={boxSize}
          setSize={setBoxSize}
          setPosition={setBoxPosition}
          header={
            <Header
              setShowPopup={setShowBox}
              simpleStyle={simpleStyle}
              setSimpleStyle={setSimpleStyle}
              hideClickAway={hideClickAway}
              setHideClickAway={setHideClickAway}
              followSelection={followSelection}
              setFollowSelection={setFollowSelection}
              mouseHover={mouseHover}
            />
          }
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => setMouseHover(true)}
          onMouseLeave={() => setMouseHover(false)}
        >
          <TranForm
            text={text}
            setText={setText}
            tranboxSetting={tranboxSetting}
            transApis={transApis}
            simpleStyle={simpleStyle}
            langDetector={langDetector}
            enDict={enDict}
          />
        </DraggableResizable>
      </ThemeProvider>
    </SettingProvider>
  );
}
