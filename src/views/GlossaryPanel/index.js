import Theme from "../../hooks/Theme";
import { SettingProvider } from "../../hooks/Setting";
import Draggable from "../Action/Draggable";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import FavoriteIcon from "@mui/icons-material/Favorite";
import BlockIcon from "@mui/icons-material/Block";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useI18n } from "../../hooks/I18n";
import { useFavWords, WORD_TYPE_FAVORITE, WORD_TYPE_NO_TRANSLATE, WORD_TYPE_CUSTOM_TRANSLATE } from "../../hooks/FavWords";
import { useAllTextStyles, useStyleList } from "../../hooks/CustomStyles";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import useWindowSize from "../../hooks/WindowSize";
import {
  MSG_UPDATE_STYLES,
  MSG_UPDATE_GLOSSARY,
  MSG_OPEN_GLOSSARY_PANEL,
  EVENT_KISS_INNER,
} from "../../config";
import { isExt } from "../../libs/client";
import { sendTabMsg } from "../../libs/msg";
import { useTheme, alpha } from "@mui/material/styles";
import {
  generateStyleCode,
  parseStyleCode,
  STYLE_TYPES,
  LINE_STYLES,
  BORDER_STYLES,
  BACKGROUND_TYPES,
} from "../Options/StylePresets";
import { DEFAULT_COLOR } from "../../config";
import Slider from "@mui/material/Slider";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import InputAdornment from "@mui/material/InputAdornment";
import PaletteIcon from "@mui/icons-material/Palette";
import OpacityIcon from "@mui/icons-material/Opacity";
import BorderOuterIcon from "@mui/icons-material/BorderOuter";
import CodeIcon from "@mui/icons-material/Code";
import { css } from "@emotion/css";
import { getRandomQuote } from "../../config/quotes";
import { useSetting } from "../../hooks/Setting";

function GlossaryContent({ onClose, processActions }) {
  const theme = useTheme();
  const i18n = useI18n();
  const [activeTab, setActiveTab] = useState(0);

  const {
    favList,
    wordList,
    addWord,
    updateWord,
    removeWord,
    favoriteList,
    noTranslateList,
    customTranslateList,
  } = useFavWords();

  const [newWord, setNewWord] = useState("");
  const [newCustomTranslation, setNewCustomTranslation] = useState("");
  const [selectedWord, setSelectedWord] = useState(null);

  const notifyUpdate = useCallback(async () => {
    if (isExt) {
      try {
        await sendTabMsg(MSG_UPDATE_GLOSSARY, { favWords: Object.fromEntries(favList) });
      } catch (err) {
        //
      }
    } else if (processActions) {
      processActions({ action: MSG_UPDATE_GLOSSARY, args: { favWords: Object.fromEntries(favList) } });
    }
  }, [favList, processActions]);

  const handleAddWord = (wordType) => {
    if (!newWord.trim()) return;
    const word = newWord.trim();
    const data = { type: wordType };
    if (wordType === WORD_TYPE_CUSTOM_TRANSLATE && newCustomTranslation.trim()) {
      data.customTranslation = newCustomTranslation.trim();
    }
    addWord(word, data);
    setNewWord("");
    setNewCustomTranslation("");
    notifyUpdate();
  };

  const handleRemoveWord = (word) => {
    removeWord(word);
    notifyUpdate();
  };

  const handleUpdateWordType = (word, newType) => {
    updateWord(word, { type: newType });
    notifyUpdate();
  };

  const handleUpdateCustomTranslation = (word, translation) => {
    updateWord(word, { customTranslation: translation });
    notifyUpdate();
  };

  const getActiveList = () => {
    switch (activeTab) {
      case 0:
        return favoriteList;
      case 1:
        return noTranslateList;
      case 2:
        return customTranslateList;
      default:
        return favList;
    }
  };

  const getTypeChip = (type) => {
    switch (type) {
      case WORD_TYPE_NO_TRANSLATE:
        return <Chip size="small" icon={<BlockIcon />} label={i18n("type_no_translate")} color="error" variant="outlined" />;
      case WORD_TYPE_CUSTOM_TRANSLATE:
        return <Chip size="small" icon={<EditIcon />} label={i18n("type_custom_translate")} color="primary" variant="outlined" />;
      default:
        return <Chip size="small" icon={<FavoriteIcon />} label={i18n("type_favorite")} color="success" variant="outlined" />;
    }
  };

  const activeList = getActiveList();

  return (
    <Stack spacing={2} sx={{ p: 2, maxHeight: "400px", overflowY: "auto" }}>
      <Stack direction="row" spacing={2} alignItems="center" useFlexGap>
        <TextField
          size="small"
          label={i18n("word") || "Word"}
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          sx={{ flexGrow: 1 }}
          placeholder={i18n("enter_word") || "Enter word..."}
        />
        {activeTab === 2 && (
          <TextField
            size="small"
            label={i18n("custom_translation") || "Translation"}
            value={newCustomTranslation}
            onChange={(e) => setNewCustomTranslation(e.target.value)}
            sx={{ flexGrow: 1 }}
          />
        )}
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() =>
            handleAddWord(
              activeTab === 0
                ? WORD_TYPE_FAVORITE
                : activeTab === 1
                ? WORD_TYPE_NO_TRANSLATE
                : WORD_TYPE_CUSTOM_TRANSLATE
            )
          }
        >
          {i18n("add")}
        </Button>
      </Stack>

      <Tabs
        value={activeTab}
        onChange={(e, newValue) => setActiveTab(newValue)}
        variant="fullWidth"
        size="small"
      >
        <Tab
          label={`${i18n("favorite_words")} (${favoriteList.length})`}
          icon={<FavoriteIcon fontSize="small" />}
          iconPosition="start"
        />
        <Tab
          label={`${i18n("no_translate_words")} (${noTranslateList.length})`}
          icon={<BlockIcon fontSize="small" />}
          iconPosition="start"
        />
        <Tab
          label={`${i18n("custom_translate_words")} (${customTranslateList.length})`}
          icon={<EditIcon fontSize="small" />}
          iconPosition="start"
        />
      </Tabs>

      {activeList.length === 0 ? (
        <Typography color="text.secondary" textAlign="center" py={2}>
          {activeTab === 0
            ? i18n("favorite_words")
            : activeTab === 1
            ? i18n("no_translate_words")
            : i18n("custom_translate_words")}
          : {i18n("error_cant_be_blank")}
        </Typography>
      ) : (
        <Stack spacing={1}>
          {activeList.map(([word, wordData], index) => (
            <Stack
              key={word}
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{
                p: 1.5,
                borderRadius: 1,
                backgroundColor: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2" sx={{ fontWeight: "bold", minWidth: 20 }}>
                  {index + 1}.
                </Typography>
                <Typography variant="body2" sx={{ minWidth: 120 }}>
                  {word}
                </Typography>
                {getTypeChip(wordData?.type || WORD_TYPE_FAVORITE)}
                {wordData?.type === WORD_TYPE_CUSTOM_TRANSLATE && wordData?.customTranslation && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    → {wordData.customTranslation}
                  </Typography>
                )}
              </Stack>
              <Stack direction="row" spacing={0.5}>
                {wordData?.type !== WORD_TYPE_FAVORITE && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleUpdateWordType(word, WORD_TYPE_FAVORITE)}
                  >
                    {i18n("type_favorite")}
                  </Button>
                )}
                {wordData?.type !== WORD_TYPE_NO_TRANSLATE && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={() => handleUpdateWordType(word, WORD_TYPE_NO_TRANSLATE)}
                  >
                    {i18n("type_no_translate")}
                  </Button>
                )}
                {wordData?.type !== WORD_TYPE_CUSTOM_TRANSLATE && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="primary"
                    onClick={() => setSelectedWord(word)}
                  >
                    {i18n("type_custom_translate")}
                  </Button>
                )}
                {wordData?.type === WORD_TYPE_CUSTOM_TRANSLATE && (
                  <TextField
                    size="small"
                    placeholder={i18n("enter_translation") || "Translation..."}
                    value={wordData?.customTranslation || ""}
                    onChange={(e) => handleUpdateCustomTranslation(word, e.target.value)}
                    onBlur={() => notifyUpdate()}
                    sx={{ width: 150 }}
                  />
                )}
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleRemoveWord(word)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}

      {selectedWord && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{
            p: 1.5,
            borderRadius: 1,
            backgroundColor: alpha(theme.palette.primary.main, 0.05),
          }}
        >
        <Typography variant="caption" color="text.secondary">
          {i18n("selected_word") || "Selected"}: <strong>{selectedWord}</strong>
        </Typography>
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            setSelectedWord(null);
          }}
        >
          {i18n("cancel")}
        </Button>
        {selectedWord && (
          <>
            <TextField
              size="small"
              label={i18n("custom_translation")}
              placeholder={i18n("enter_translation") || "Enter translation..."}
              value={newCustomTranslation}
              onChange={(e) => setNewCustomTranslation(e.target.value)}
              sx={{ flexGrow: 1 }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                handleUpdateWordType(selectedWord, WORD_TYPE_CUSTOM_TRANSLATE);
                if (newCustomTranslation.trim()) {
                  handleUpdateCustomTranslation(selectedWord, newCustomTranslation.trim());
                }
                setSelectedWord(null);
                setNewCustomTranslation("");
              }}
            >
              {i18n("save")}
            </Button>
          </>
        )}
      </Stack>
    )}
    </Stack>
  );
}

function StylesContent({ onClose, processActions }) {
  const theme = useTheme();
  const i18n = useI18n();
  const { setting: { uiLang } } = useSetting();
  const { customStyles, addStyle, deleteStyle, updateStyle } = useStyleList();
  const { builtinStyles, allTextStyles } = useAllTextStyles();
  const [selectedStyleIndex, setSelectedStyleIndex] = useState(null);

  const selectedStyle = selectedStyleIndex !== null && selectedStyleIndex < customStyles.length
    ? customStyles[selectedStyleIndex]
    : null;

  const notifyUpdate = useCallback(async () => {
    if (isExt) {
      try {
        await sendTabMsg(MSG_UPDATE_STYLES, { customStyles });
      } catch (err) {
        //
      }
    } else if (processActions) {
      processActions({ action: MSG_UPDATE_STYLES, args: { customStyles } });
    }
  }, [customStyles, processActions]);

  const handleAddStyle = () => {
    addStyle();
    setSelectedStyleIndex(customStyles.length);
  };

  const handleUpdateStyle = (styleSlug, data) => {
    updateStyle(styleSlug, data);
    notifyUpdate();
  };

  const handleDeleteStyle = (styleSlug) => {
    deleteStyle(styleSlug);
    setSelectedStyleIndex(null);
    notifyUpdate();
  };

  return (
    <Stack spacing={2} sx={{ p: 2, maxHeight: "400px", overflowY: "auto" }}>
      <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
        {i18n("style_color") || "Customize Styles"}
      </Typography>

      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddStyle}
        >
          {i18n("add")}
        </Button>
        <Typography variant="caption" color="text.secondary">
          {i18n("custom_styles") || "Custom Styles"}: {customStyles.length}
        </Typography>
      </Stack>

      {selectedStyleIndex === null ? (
        <Stack spacing={1}>
          {customStyles.map((style, index) => (
            <Stack
              key={style.styleSlug}
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{
                p: 1,
                borderRadius: 1,
                backgroundColor: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                cursor: "pointer",
                "&:hover": {
                  backgroundColor: alpha(theme.palette.primary.main, 0.05),
                },
              }}
              onClick={() => setSelectedStyleIndex(index)}
            >
              <Typography variant="body2">{style.styleName}</Typography>
              <Chip
                size="small"
                label={i18n("click_to_edit") || "Click to edit"}
                variant="outlined"
              />
            </Stack>
          ))}

          {customStyles.length === 0 && (
            <Typography color="text.secondary" textAlign="center" py={2}>
              {i18n("no_custom_styles") || "No custom styles yet. Click 'Add' to create one."}
            </Typography>
          )}
        </Stack>
      ) : (
        <StyleEditor
          style={selectedStyle}
          onBack={() => setSelectedStyleIndex(null)}
          onSave={(data) => handleUpdateStyle(selectedStyle.styleSlug, data)}
          onDelete={() => handleDeleteStyle(selectedStyle.styleSlug)}
        />
      )}

      <Divider />

      <Typography variant="caption" color="text.secondary">
        {i18n("builtin_styles") || "Built-in Styles"}: {builtinStyles.length}
      </Typography>
    </Stack>
  );
}

function StyleEditor({ style, onBack, onSave, onDelete }) {
  const theme = useTheme();
  const i18n = useI18n();
  const [formData, setFormData] = useState(style);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { setting: { uiLang } } = useSetting();

  const [visualOptions, setVisualOptions] = useState({
    styleType: "custom",
    color: DEFAULT_COLOR,
    borderWidth: 1,
    opacity: 0.8,
    lineStyle: "dashed",
    borderStyle: "dashed",
    backgroundType: "marker",
  });

  useEffect(() => {
    if (style) {
      setFormData(style);
      const parsed = parseStyleCode(style.styleCode);
      setVisualOptions({
        styleType: parsed.styleType || "custom",
        color: parsed.color || DEFAULT_COLOR,
        borderWidth: parsed.borderWidth || 1,
        opacity: parsed.opacity || 0.8,
        lineStyle: parsed.lineStyle || "dashed",
        borderStyle: parsed.borderStyle || "dashed",
        backgroundType: parsed.backgroundType || "marker",
      });
    }
  }, [style]);

  const handleVisualOptionChange = (option, value) => {
    const newOptions = { ...visualOptions, [option]: value };
    setVisualOptions(newOptions);

    if (newOptions.styleType !== "custom") {
      const newStyleCode = generateStyleCode(newOptions);
      setFormData((prevData) => ({
        ...prevData,
        styleCode: newStyleCode,
      }));
    }
  };

  const textClass = useMemo(
    () => css`
      ${formData?.styleCode || ""}
    `,
    [formData?.styleCode]
  );

  const quote = useMemo(() => {
    const q = getRandomQuote();
    if (uiLang === "en") {
      return [q.zh, q.en];
    }
    return [q.en, q[uiLang]];
  }, [uiLang]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button size="small" onClick={onBack}>
          ← {i18n("back") || "Back"}
        </Button>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          {formData?.styleName || i18n("edit_style")}
        </Typography>
        <Button size="small" variant="outlined" color="error" onClick={onDelete}>
          {i18n("delete")}
        </Button>
      </Stack>

      <Box
        sx={{
          p: 2,
          borderRadius: 1,
          backgroundColor: alpha(theme.palette.primary.main, 0.05),
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {i18n("preview") || "Preview"}:
        </Typography>
        <Typography variant="body2">
          {quote[0]}
          <br />
          <span className={textClass}>{quote[1]}</span>
        </Typography>
      </Box>

      <TextField
        size="small"
        label={i18n("style_name")}
        value={formData?.styleName || ""}
        onChange={(e) => setFormData({ ...formData, styleName: e.target.value })}
      />

      <TextField
        select
        fullWidth
        size="small"
        label={i18n("text_style_alt") || "Style Type"}
        value={visualOptions.styleType}
        onChange={(e) => handleVisualOptionChange("styleType", e.target.value)}
        InputLabelProps={{ shrink: true }}
      >
        {STYLE_TYPES.map((type) => (
          <MenuItem key={type.value} value={type.value}>
            {type.label}
          </MenuItem>
        ))}
      </TextField>

      {visualOptions.styleType !== "custom" && (
        <Stack spacing={2}>
          {visualOptions.styleType === "line" && (
            <TextField
              select
              fullWidth
              size="small"
              label={i18n("text_style_alt") || "Line Style"}
              value={visualOptions.lineStyle}
              onChange={(e) => handleVisualOptionChange("lineStyle", e.target.value)}
              InputLabelProps={{ shrink: true }}
            >
              {LINE_STYLES.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </TextField>
          )}

          {visualOptions.styleType === "box" && (
            <TextField
              select
              fullWidth
              size="small"
              label={i18n("text_style_alt") || "Border Style"}
              value={visualOptions.borderStyle}
              onChange={(e) => handleVisualOptionChange("borderStyle", e.target.value)}
              InputLabelProps={{ shrink: true }}
            >
              {BORDER_STYLES.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </TextField>
          )}

          {visualOptions.styleType === "background" && (
            <TextField
              select
              fullWidth
              size="small"
              label={i18n("text_style_alt") || "Background Type"}
              value={visualOptions.backgroundType}
              onChange={(e) => handleVisualOptionChange("backgroundType", e.target.value)}
              InputLabelProps={{ shrink: true }}
            >
              {BACKGROUND_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Stack direction="row" spacing={2} alignItems="center" useFlexGap>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel shrink>
                <PaletteIcon fontSize="small" sx={{ mr: 0.5 }} />
                {i18n("style_color") || "Color"}
              </InputLabel>
              <TextField
                size="small"
                type="color"
                value={visualOptions.color}
                onChange={(e) => handleVisualOptionChange("color", e.target.value)}
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: 1,
                          backgroundColor: visualOptions.color,
                          border: "1px solid #ccc",
                        }}
                      />
                    </InputAdornment>
                  ),
                }}
              />
            </FormControl>

            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="caption" display="block" gutterBottom>
                <OpacityIcon fontSize="small" sx={{ mr: 0.5 }} />
                {i18n("text_opacity") || "Opacity"}: {Math.round(visualOptions.opacity * 100)}%
              </Typography>
              <Slider
                size="small"
                value={visualOptions.opacity}
                onChange={(e, value) => handleVisualOptionChange("opacity", value)}
                min={0.1}
                max={1}
                step={0.05}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
              />
            </Box>
          </Stack>

          {(visualOptions.styleType === "line" || visualOptions.styleType === "box") && (
            <Box>
              <Typography variant="caption" display="block" gutterBottom>
                <BorderOuterIcon fontSize="small" sx={{ mr: 0.5 }} />
                {i18n("border_width") || "Border Width"}: {visualOptions.borderWidth}px
              </Typography>
              <Slider
                size="small"
                value={visualOptions.borderWidth}
                onChange={(e, value) => handleVisualOptionChange("borderWidth", value)}
                min={1}
                max={6}
                step={1}
                marks
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${value}px`}
              />
            </Box>
          )}
        </Stack>
      )}

      <Divider>
        <Chip
          size="small"
          icon={<CodeIcon fontSize="small" />}
          label={i18n("style_code") || "CSS Code"}
          onClick={() => setShowAdvanced(!showAdvanced)}
          clickable
          color={showAdvanced ? "primary" : "default"}
        />
      </Divider>

      {showAdvanced && (
        <TextField
          size="small"
          label={i18n("style_code")}
          value={formData?.styleCode || ""}
          onChange={(e) => setFormData({ ...formData, styleCode: e.target.value })}
          multiline
          maxRows={8}
          minRows={4}
          fullWidth
        />
      )}

      <Stack direction="row" justifyContent="flex-end">
        <Button
          size="small"
          variant="contained"
          onClick={() => onSave(formData)}
        >
          {i18n("save")}
        </Button>
      </Stack>
    </Stack>
  );
}

export default function GlossaryPanel({ onClose, translator, processActions }) {
  const theme = useTheme();
  const windowSize = useWindowSize();
  const [showPanel, setShowPanel] = useState(true);
  const [activeMainTab, setActiveMainTab] = useState(0);
  const i18n = useI18n();

  const panelProps = useMemo(() => {
    const width = Math.min(windowSize.w, 600);
    const height = Math.min(windowSize.h, 500);
    const left = (windowSize.w - width) / 2;
    const top = (windowSize.h - height) / 2;
    return {
      windowSize,
      width,
      height,
      left,
      top,
    };
  }, [windowSize]);

  useEffect(() => {
    const handleStatusUpdate = (event) => {
      if (event.detail?.action === MSG_OPEN_GLOSSARY_PANEL) {
        setShowPanel((pre) => !pre);
      }
    };

    document.addEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    return () => {
      document.removeEventListener(EVENT_KISS_INNER, handleStatusUpdate);
    };
  }, []);

  const handleClose = () => {
    setShowPanel(false);
    if (onClose) onClose();
  };

  if (!showPanel) return null;

  return (
    <SettingProvider context="glossaryPanel">
      <Theme>
        <Draggable
          key="glossary"
          {...panelProps}
          usePaper
          handler={
            <Box sx={{ cursor: "move" }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ p: 1, px: 2, borderBottom: `1px solid ${theme.palette.divider}` }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                  {i18n("glossary_setting") || "Glossary & Styles"}
                </Typography>
                <Stack direction="row" spacing={0.5}>
                  <IconButton size="small" onClick={handleClose}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
              <Tabs
                value={activeMainTab}
                onChange={(e, newValue) => setActiveMainTab(newValue)}
                variant="fullWidth"
                sx={{ minHeight: 32 }}
              >
                <Tab label={i18n("glossary") || "Glossary"} sx={{ minHeight: 32, py: 0.5 }} />
                <Tab label={i18n("style_color") || "Styles"} sx={{ minHeight: 32, py: 0.5 }} />
              </Tabs>
            </Box>
          }
        >
          <Box sx={{ width: 600, maxWidth: "100%" }}>
            {activeMainTab === 0 ? (
              <GlossaryContent onClose={handleClose} processActions={processActions} />
            ) : (
              <StylesContent onClose={handleClose} processActions={processActions} />
            )}
          </Box>
        </Draggable>
      </Theme>
    </SettingProvider>
  );
}
