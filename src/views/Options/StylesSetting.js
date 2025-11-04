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

function StyleFields({ customStyle, deleteStyle, updateStyle, isBuiltin }) {
  const i18n = useI18n();
  const {
    setting: { uiLang },
  } = useSetting();
  const [formData, setFormData] = useState({});
  const [isModified, setIsModified] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    if (customStyle) {
      setFormData(customStyle);
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
    return [q.en, q.zh];
  }, [uiLang]);

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
      <TextField
        size="small"
        label={i18n("style_code")}
        name="styleCode"
        value={styleCode}
        onChange={handleChange}
        multiline
        maxRows={10}
        disabled={isBuiltin}
      />

      {!isBuiltin && (
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
