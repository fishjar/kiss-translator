import { useState, useEffect, useMemo } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import { useConfirm } from "../../hooks/Confirm";
import Box from "@mui/material/Box";
import { useAllTextStyles, useStyleList } from "../../hooks/CustomStyles";
import { css } from "@emotion/css";
import { getRandomQuote } from "../../config/quotes";
import { useSetting } from "../../hooks/Setting";
import MenuItem from "@mui/material/MenuItem";
import Slider from "@mui/material/Slider";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import InputAdornment from "@mui/material/InputAdornment";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import PaletteIcon from "@mui/icons-material/Palette";
import OpacityIcon from "@mui/icons-material/Opacity";
import BorderOuterIcon from "@mui/icons-material/BorderOuter";
import CodeIcon from "@mui/icons-material/Code";
import {
  generateStyleCode,
  parseStyleCode,
  STYLE_TYPES,
  LINE_STYLES,
  BORDER_STYLES,
  BACKGROUND_TYPES,
} from "./StylePresets";
import { DEFAULT_COLOR } from "../../config";

function StyleFields({ customStyle, deleteStyle, updateStyle, isBuiltin }) {
  const i18n = useI18n();
  const {
    setting: { uiLang },
  } = useSetting();
  const [formData, setFormData] = useState({});
  const [isModified, setIsModified] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const confirm = useConfirm();

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
    if (customStyle) {
      setFormData(customStyle);
      const parsed = parseStyleCode(customStyle.styleCode);
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
  }, [customStyle]);

  useEffect(() => {
    if (!customStyle) return;
    const hasChanged = JSON.stringify(customStyle) !== JSON.stringify(formData);
    setIsModified(hasChanged);
  }, [customStyle, formData]);

  const handleChange = (e) => {
    e.preventDefault();
    let { name, value } = e.target;

    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

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

  const handleSave = () => {
    updateStyle(customStyle.styleSlug, formData);
  };

  const handleDelete = async () => {
    const isConfirmed = await confirm({
      confirmText: i18n("delete"),
      cancelText: i18n("cancel"),
    });

    if (isConfirmed) {
      deleteStyle(customStyle.styleSlug);
    }
  };

  const { styleName = "", styleCode = "" } = formData;

  const textClass = useMemo(
    () => css`
      ${styleCode}
    `,
    [styleCode]
  );

  const quote = useMemo(() => {
    const q = getRandomQuote();
    if (uiLang === "en") {
      return [q.zh, q.en];
    }
    return [q.en, q[uiLang]];
  }, [uiLang]);

  const getStyleTypeLabel = (type) => {
    const found = STYLE_TYPES.find((t) => t.value === type);
    return found ? found.label : "Custom";
  };

  return (
    <Stack spacing={3}>
      <Box>
        {quote[0]}
        <br />
        <span className={textClass}>{quote[1]}</span>
      </Box>

      <TextField
        size="small"
        label={i18n("style_name")}
        name="styleName"
        value={styleName}
        onChange={handleChange}
        disabled={isBuiltin}
      />

      {!isBuiltin && (
        <>
          <Divider>
            <Chip
              size="small"
              icon={<PaletteIcon fontSize="small" />}
              label={i18n("style_color") || "Visual Editor"}
            />
          </Divider>

          <TextField
            select
            fullWidth
            size="small"
            label={i18n("text_style_alt") || "Style Type"}
            value={visualOptions.styleType}
            onChange={(e) =>
              handleVisualOptionChange("styleType", e.target.value)
            }
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
                  onChange={(e) =>
                    handleVisualOptionChange("lineStyle", e.target.value)
                  }
                  InputLabelProps={{ shrink: true }}
                >
                  {LINE_STYLES.map((style) => (
                    <MenuItem key={style.value} value={style.value}>
                      {style.label}
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
                  onChange={(e) =>
                    handleVisualOptionChange("borderStyle", e.target.value)
                  }
                  InputLabelProps={{ shrink: true }}
                >
                  {BORDER_STYLES.map((style) => (
                    <MenuItem key={style.value} value={style.value}>
                      {style.label}
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
                  onChange={(e) =>
                    handleVisualOptionChange(
                      "backgroundType",
                      e.target.value
                    )
                  }
                  InputLabelProps={{ shrink: true }}
                >
                  {BACKGROUND_TYPES.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                useFlexGap
              >
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel shrink htmlFor="color-picker">
                    <PaletteIcon fontSize="small" sx={{ mr: 0.5 }} />
                    {i18n("style_color") || "Color"}
                  </InputLabel>
                  <TextField
                    id="color-picker"
                    size="small"
                    type="color"
                    value={visualOptions.color}
                    onChange={(e) =>
                      handleVisualOptionChange("color", e.target.value)
                    }
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
                    {i18n("text_opacity") || "Opacity"}:{" "}
                    {Math.round(visualOptions.opacity * 100)}%
                  </Typography>
                  <Slider
                    size="small"
                    value={visualOptions.opacity}
                    onChange={(e, value) =>
                      handleVisualOptionChange("opacity", value)
                    }
                    min={0.1}
                    max={1}
                    step={0.05}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) =>
                      `${Math.round(value * 100)}%`
                    }
                  />
                </Box>
              </Stack>

              {(visualOptions.styleType === "line" ||
                visualOptions.styleType === "box") && (
                <Box>
                  <Typography variant="caption" display="block" gutterBottom>
                    <BorderOuterIcon fontSize="small" sx={{ mr: 0.5 }} />
                    {i18n("border_width") || "Border Width"}:{" "}
                    {visualOptions.borderWidth}px
                  </Typography>
                  <Slider
                    size="small"
                    value={visualOptions.borderWidth}
                    onChange={(e, value) =>
                      handleVisualOptionChange("borderWidth", value)
                    }
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
              name="styleCode"
              value={styleCode}
              onChange={handleChange}
              multiline
              maxRows={15}
              minRows={8}
              fullWidth
              helperText={
                visualOptions.styleType !== "custom"
                  ? "Note: Changes here will be overwritten by visual editor settings."
                  : ""
              }
            />
          )}

          <Stack
            direction="row"
            alignItems="center"
            spacing={2}
            useFlexGap
            flexWrap="wrap"
          >
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={!isModified}
            >
              {i18n("save")}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={handleDelete}
            >
              {i18n("delete")}
            </Button>
          </Stack>
        </>
      )}

      {isBuiltin && (
        <TextField
          size="small"
          label={i18n("style_code")}
          name="styleCode"
          value={styleCode}
          onChange={handleChange}
          multiline
          maxRows={10}
          disabled={isBuiltin}
          fullWidth
        />
      )}
    </Stack>
  );
}

function StyleAccordion({ customStyle, deleteStyle, updateStyle, isBuiltin }) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  return (
    <Accordion expanded={expanded} onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography
          sx={{
            overflowWrap: "anywhere",
          }}
        >
          {`${customStyle.styleName}`}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && (
          <StyleFields
            customStyle={customStyle}
            deleteStyle={deleteStyle}
            updateStyle={updateStyle}
            isBuiltin={isBuiltin}
          />
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default function StylesSetting() {
  const i18n = useI18n();
  const { customStyles, addStyle, deleteStyle, updateStyle } = useStyleList();
  const { builtinStyles } = useAllTextStyles();

  const handleClick = (e) => {
    e.preventDefault();
    addStyle();
  };

  return (
    <Box>
      <Stack spacing={3}>
        <Box>
          <Button
            size="small"
            id="add-style-button"
            variant="contained"
            onClick={handleClick}
            startIcon={<AddIcon />}
          >
            {i18n("add")}
          </Button>
        </Box>

        <Box>
          {customStyles.map((customStyle) => (
            <StyleAccordion
              key={customStyle.styleSlug}
              customStyle={customStyle}
              deleteStyle={deleteStyle}
              updateStyle={updateStyle}
            />
          ))}
        </Box>
        <Box>
          {builtinStyles.map((customStyle) => (
            <StyleAccordion
              key={customStyle.styleSlug}
              customStyle={customStyle}
              deleteStyle={deleteStyle}
              updateStyle={updateStyle}
              isBuiltin={true}
            />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
