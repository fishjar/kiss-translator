import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import {
  DEFAULT_RULE,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  OPT_TRANS_ALL,
  OPT_STYLE_ALL,
} from "../../config";
import { useState, useRef } from "react";
import Alert from "@mui/material/Alert";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useRules } from "../../hooks/Rules";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FileUploadIcon from "@mui/icons-material/FileUpload";

function RuleFields({ rule, rules, setShow }) {
  const initFormValues = rule || {
    ...DEFAULT_RULE,
    pattern: "",
    transOpen: true,
  };
  const editMode = !!rule;

  const i18n = useI18n();
  const [disabled, setDisabled] = useState(editMode);
  const [errors, setErrors] = useState({});
  const [formValues, setFormValues] = useState(initFormValues);
  const {
    pattern,
    selector,
    translator,
    fromLang,
    toLang,
    textStyle,
    transOpen,
  } = formValues;

  const hasSamePattern = (str) => {
    for (const item of rules.list) {
      if (item.pattern === str && rule?.pattern !== str) {
        return true;
      }
    }
    return false;
  };

  const handleFocus = (e) => {
    e.preventDefault();
    const { name } = e.target;
    setErrors((pre) => ({ ...pre, [name]: "" }));
  };

  const handleChange = (e) => {
    e.preventDefault();
    const { name, value } = e.target;
    setFormValues((pre) => ({ ...pre, [name]: value }));
  };

  const handleCancel = (e) => {
    e.preventDefault();
    if (editMode) {
      setDisabled(true);
    } else {
      setShow(false);
    }
    setErrors({});
    setFormValues(initFormValues);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = {};
    if (!pattern.trim()) {
      errors.pattern = i18n("error_cant_be_blank");
    }
    if (!selector.trim()) {
      errors.selector = i18n("error_cant_be_blank");
    }
    if (hasSamePattern(pattern)) {
      errors.pattern = i18n("error_duplicate_values");
    }
    if (Object.keys(errors).length > 0) {
      setErrors(errors);
      return;
    }

    if (editMode) {
      // 编辑
      setDisabled(true);
      rules.put(rule.pattern, formValues);
    } else {
      // 添加
      rules.add(formValues);
      setShow(false);
      setFormValues(initFormValues);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={2}>
        <TextField
          size="small"
          label={i18n("pattern")}
          error={!!errors.pattern}
          helperText={errors.pattern ?? i18n("pattern_helper")}
          name="pattern"
          value={pattern}
          disabled={rule?.pattern === "*" || disabled}
          onChange={handleChange}
          onFocus={handleFocus}
        />
        <TextField
          size="small"
          label={i18n("selector")}
          error={!!errors.selector}
          helperText={errors.selector ?? i18n("selector_helper")}
          name="selector"
          value={selector}
          disabled={disabled}
          onChange={handleChange}
          onFocus={handleFocus}
          multiline
          minRows={2}
          maxRows={10}
        />

        <Box>
          <Grid container spacing={2} columns={20}>
            <Grid item xs={10} md={4}>
              <TextField
                select
                size="small"
                fullWidth
                name="transOpen"
                value={transOpen}
                label={i18n("translate_switch")}
                disabled={disabled}
                onChange={handleChange}
              >
                <MenuItem value={true}>{i18n("default_enabled")}</MenuItem>
                <MenuItem value={false}>{i18n("default_disabled")}</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={10} md={4}>
              <TextField
                select
                size="small"
                fullWidth
                name="translator"
                value={translator}
                label={i18n("translate_service")}
                disabled={disabled}
                onChange={handleChange}
              >
                {OPT_TRANS_ALL.map((item) => (
                  <MenuItem value={item}>{item}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={10} md={4}>
              <TextField
                select
                size="small"
                fullWidth
                name="fromLang"
                value={fromLang}
                label={i18n("from_lang")}
                disabled={disabled}
                onChange={handleChange}
              >
                {OPT_LANGS_FROM.map(([lang, name]) => (
                  <MenuItem value={lang}>{name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={10} md={4}>
              <TextField
                select
                size="small"
                fullWidth
                name="toLang"
                value={toLang}
                label={i18n("to_lang")}
                disabled={disabled}
                onChange={handleChange}
              >
                {OPT_LANGS_TO.map(([lang, name]) => (
                  <MenuItem value={lang}>{name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={10} md={4}>
              <TextField
                select
                size="small"
                fullWidth
                name="textStyle"
                value={textStyle}
                label={i18n("text_style")}
                disabled={disabled}
                onChange={handleChange}
              >
                {OPT_STYLE_ALL.map((item) => (
                  <MenuItem value={item}>{i18n(item)}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </Box>

        {editMode ? (
          // 编辑
          <Stack direction="row" spacing={2}>
            {disabled ? (
              <>
                <Button
                  size="small"
                  variant="contained"
                  onClick={(e) => {
                    e.preventDefault();
                    setDisabled(false);
                  }}
                >
                  {i18n("edit")}
                </Button>
                {rule?.pattern !== "*" && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={(e) => {
                      e.preventDefault();
                      rules.del(rule.pattern);
                    }}
                  >
                    {i18n("delete")}
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button size="small" variant="contained" type="submit">
                  {i18n("save")}
                </Button>
                <Button size="small" variant="outlined" onClick={handleCancel}>
                  {i18n("cancel")}
                </Button>
              </>
            )}
          </Stack>
        ) : (
          // 添加
          <Stack direction="row" spacing={2}>
            <Button size="small" variant="contained" type="submit">
              {i18n("save")}
            </Button>
            <Button size="small" variant="outlined" onClick={handleCancel}>
              {i18n("cancel")}
            </Button>
          </Stack>
        )}
      </Stack>
    </form>
  );
}

function DownloadButton({ data, text, fileName }) {
  const handleClick = (e) => {
    e.preventDefault();
    if (data) {
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName || `${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };
  return (
    <Button
      size="small"
      variant="outlined"
      onClick={handleClick}
      startIcon={<FileDownloadIcon />}
    >
      {text}
    </Button>
  );
}

function UploadButton({ onChange, text }) {
  const inputRef = useRef(null);
  const handleClick = () => {
    inputRef.current && inputRef.current.click();
  };

  return (
    <Button
      size="small"
      variant="outlined"
      onClick={handleClick}
      startIcon={<FileUploadIcon />}
    >
      {text}
      <input
        type="file"
        accept=".json"
        ref={inputRef}
        onChange={onChange}
        hidden
      />
    </Button>
  );
}

export default function Rules() {
  const i18n = useI18n();
  const rules = useRules();
  const [showAdd, setShowAdd] = useState(false);

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) {
      return;
    }

    if (!file.type.includes("json")) {
      alert(i18n("error_wrong_file_type"));
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        await rules.merge(JSON.parse(e.target.result));
      } catch (err) {
        console.log("[import rules]", err);
      }
    };
    reader.readAsText(file);
  };

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="warning">{i18n("advanced_warn")}</Alert>

        <Stack direction="row" spacing={2}>
          <Button
            size="small"
            variant="contained"
            disabled={showAdd}
            onClick={(e) => {
              e.preventDefault();
              setShowAdd(true);
            }}
          >
            {i18n("add")}
          </Button>

          <UploadButton text={i18n("import")} onChange={handleImport} />
          <DownloadButton
            data={JSON.stringify([...rules.list].reverse(), null, "\t")}
            text={i18n("export")}
          />
        </Stack>

        {showAdd && <RuleFields rules={rules} setShow={setShowAdd} />}

        <Box>
          {rules.list.map((rule) => (
            <Accordion key={rule.pattern}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>{rule.pattern}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <RuleFields rule={rule} rules={rules} />
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
