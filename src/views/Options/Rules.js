import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import {
  GLOBAL_KEY,
  DEFAULT_RULE,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  OPT_TRANS_ALL,
  OPT_STYLE_ALL,
  OPT_STYLE_DIY,
  OPT_STYLE_USE_COLOR,
  URL_KISS_RULES_NEW_ISSUE,
} from "../../config";
import { useState, useRef, useEffect, useMemo } from "react";
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
import { useSetting } from "../../hooks/Setting";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import DeleteIcon from "@mui/icons-material/Delete";
import IconButton from "@mui/material/IconButton";
import HelpIcon from "@mui/icons-material/Help";
import ShareIcon from "@mui/icons-material/Share";
import SyncIcon from "@mui/icons-material/Sync";
import { useSubRules } from "../../hooks/SubRules";
import { syncSubRules } from "../../libs/subRules";
import { loadOrFetchSubRules } from "../../libs/subRules";
import { useAlert } from "../../hooks/Alert";
import { syncShareRules } from "../../libs/sync";
import { debounce } from "../../libs/utils";
import { delSubRules, getSyncWithDefault } from "../../libs/storage";
import OwSubRule from "./OwSubRule";

function RuleFields({ rule, rules, setShow, setKeyword }) {
  const initFormValues = rule || {
    ...DEFAULT_RULE,
    transOpen: "true",
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
    bgColor,
    textDiyStyle,
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

  const handlePatternChange = useMemo(
    () =>
      debounce(async (patterns) => {
        setKeyword(patterns.trim());
      }, 500),
    [setKeyword]
  );

  const handleChange = (e) => {
    e.preventDefault();
    const { name, value } = e.target;
    setFormValues((pre) => ({ ...pre, [name]: value }));
    if (name === "pattern" && !editMode) {
      handlePatternChange(value);
    }
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
    if (hasSamePattern(pattern)) {
      errors.pattern = i18n("error_duplicate_values");
    }
    if (pattern === "*" && !errors.pattern && !selector.trim()) {
      errors.selector = i18n("error_cant_be_blank");
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

  const GlobalItem = rule?.pattern !== "*" && (
    <MenuItem key={GLOBAL_KEY} value={GLOBAL_KEY}>
      {GLOBAL_KEY}
    </MenuItem>
  );

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={2}>
        <TextField
          size="small"
          label={i18n("pattern")}
          error={!!errors.pattern}
          helperText={errors.pattern || i18n("pattern_helper")}
          name="pattern"
          value={pattern}
          disabled={rule?.pattern === "*" || disabled}
          onChange={handleChange}
          onFocus={handleFocus}
          multiline
        />
        <TextField
          size="small"
          label={i18n("selector")}
          error={!!errors.selector}
          helperText={errors.selector || i18n("selector_helper")}
          name="selector"
          value={selector}
          disabled={disabled}
          onChange={handleChange}
          onFocus={handleFocus}
          multiline
        />

        <Box>
          <Grid container spacing={2} columns={12}>
            <Grid item xs={12} sm={6} md={3} lg={2}>
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
                {GlobalItem}
                <MenuItem value={"true"}>{i18n("default_enabled")}</MenuItem>
                <MenuItem value={"false"}>{i18n("default_disabled")}</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={3} lg={2}>
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
                {GlobalItem}
                {OPT_TRANS_ALL.map((item) => (
                  <MenuItem key={item} value={item}>
                    {item}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={3} lg={2}>
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
                {GlobalItem}
                {OPT_LANGS_FROM.map(([lang, name]) => (
                  <MenuItem key={lang} value={lang}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={3} lg={2}>
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
                {GlobalItem}
                {OPT_LANGS_TO.map(([lang, name]) => (
                  <MenuItem key={lang} value={lang}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={3} lg={2}>
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
                {GlobalItem}
                {OPT_STYLE_ALL.map((item) => (
                  <MenuItem key={item} value={item}>
                    {i18n(item)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {OPT_STYLE_USE_COLOR.includes(textStyle) && (
              <Grid item xs={12} sm={6} md={3} lg={2}>
                <TextField
                  size="small"
                  fullWidth
                  name="bgColor"
                  value={bgColor}
                  label={i18n("bg_color")}
                  disabled={disabled}
                  onChange={handleChange}
                />
              </Grid>
            )}
          </Grid>
        </Box>

        {textStyle === OPT_STYLE_DIY && (
          <TextField
            size="small"
            label={i18n("diy_style")}
            helperText={i18n("diy_style_helper")}
            name="textDiyStyle"
            value={textDiyStyle}
            disabled={disabled}
            onChange={handleChange}
            multiline
          />
        )}

        {rules &&
          (editMode ? (
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
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleCancel}
                  >
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
          ))}
      </Stack>
    </form>
  );
}

function RuleAccordion({ rule, rules }) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  return (
    <Accordion expanded={expanded} onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography
          style={{
            opacity: rules ? 1 : 0.5,
          }}
        >
          {rule.pattern}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && <RuleFields rule={rule} rules={rules} />}
      </AccordionDetails>
    </Accordion>
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

function ShareButton({ rules, injectRules, selectedUrl }) {
  const alert = useAlert();
  const i18n = useI18n();
  const handleClick = async () => {
    try {
      const { syncUrl, syncKey } = await getSyncWithDefault();
      if (!syncUrl || !syncKey) {
        alert.warning(i18n("error_sync_setting"));
        return;
      }

      const shareRules = [...rules.list];
      if (injectRules) {
        const subRules = await loadOrFetchSubRules(selectedUrl);
        shareRules.splice(-1, 0, ...subRules);
      }

      const url = await syncShareRules({
        rules: shareRules,
        syncUrl,
        syncKey,
      });

      window.open(url, "_blank");
    } catch (err) {
      alert.warning(i18n("error_got_some_wrong"));
      console.log("[share rules]", err);
    }
  };

  return (
    <Button
      size="small"
      variant="outlined"
      onClick={handleClick}
      startIcon={<ShareIcon />}
    >
      {i18n("share")}
    </Button>
  );
}

function HelpButton() {
  const i18n = useI18n();
  return (
    <Button
      size="small"
      variant="outlined"
      onClick={() => {
        window.open(URL_KISS_RULES_NEW_ISSUE, "_blank");
      }}
      startIcon={<HelpIcon />}
    >
      {i18n("help")}
    </Button>
  );
}

function UserRules({ subRules }) {
  const i18n = useI18n();
  const rules = useRules();
  const [showAdd, setShowAdd] = useState(false);
  const { setting, updateSetting } = useSetting();
  const [keyword, setKeyword] = useState("");

  const injectRules = !!setting?.injectRules;
  const { selectedUrl, selectedRules } = subRules;

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

  const handleInject = () => {
    updateSetting({
      injectRules: !injectRules,
    });
  };

  useEffect(() => {
    if (!showAdd) {
      setKeyword("");
    }
  }, [showAdd]);

  return (
    <Stack spacing={3}>
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

        <ShareButton
          rules={rules}
          injectRules={injectRules}
          selectedUrl={selectedUrl}
        />

        <HelpButton />

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={injectRules}
              onChange={handleInject}
            />
          }
          label={i18n("inject_rules")}
        />
      </Stack>

      {showAdd && (
        <RuleFields
          rules={rules}
          setShow={setShowAdd}
          setKeyword={setKeyword}
        />
      )}

      <Box>
        {rules.list
          .filter(
            (rule) =>
              rule.pattern.includes(keyword) || keyword.includes(rule.pattern)
          )
          .map((rule) => (
            <RuleAccordion key={rule.pattern} rule={rule} rules={rules} />
          ))}
      </Box>

      {injectRules && (
        <Box>
          {selectedRules
            .filter(
              (rule) =>
                rule.pattern.includes(keyword) || keyword.includes(rule.pattern)
            )
            .map((rule) => (
              <RuleAccordion key={rule.pattern} rule={rule} />
            ))}
        </Box>
      )}
    </Stack>
  );
}

function SubRulesItem({ index, url, selectedUrl, delSub, setSelectedRules }) {
  const [loading, setLoading] = useState(false);

  const handleDel = async () => {
    try {
      await delSub(url);
      await delSubRules(url);
    } catch (err) {
      console.log("[del subrules]", err);
    }
  };

  const handleSync = async () => {
    try {
      setLoading(true);
      const rules = await syncSubRules(url);
      if (rules.length > 0 && url === selectedUrl) {
        setSelectedRules(rules);
      }
    } catch (err) {
      console.log("[sync sub rules]", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack direction="row" alignItems="center" spacing={2}>
      <FormControlLabel value={url} control={<Radio />} label={url} />

      {loading ? (
        <CircularProgress size={16} />
      ) : (
        <IconButton size="small" onClick={handleSync}>
          <SyncIcon fontSize="small" />
        </IconButton>
      )}

      {index !== 0 && selectedUrl !== url && (
        <IconButton size="small" onClick={handleDel}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      )}
    </Stack>
  );
}

function SubRulesEdit({ subList, addSub }) {
  const i18n = useI18n();
  const [inputText, setInputText] = useState("");
  const [inputError, setInputError] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCancel = (e) => {
    e.preventDefault();
    setShowInput(false);
    setInputText("");
    setInputError("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const url = inputText.trim();

    if (!url) {
      setInputError(i18n("error_cant_be_blank"));
      return;
    }

    if (subList.find((item) => item.url === url)) {
      setInputError(i18n("error_duplicate_values"));
      return;
    }

    try {
      setLoading(true);
      const rules = await syncSubRules(url);
      if (rules.length === 0) {
        throw new Error("empty rules");
      }
      await addSub(url);
      setShowInput(false);
      setInputText("");
    } catch (err) {
      console.log("[fetch rules]", err);
      setInputError(i18n("error_fetch_url"));
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (e) => {
    e.preventDefault();
    setInputText(e.target.value);
  };

  const handleFocus = (e) => {
    e.preventDefault();
    setInputError("");
  };

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={2}>
        <Button
          size="small"
          variant="contained"
          disabled={showInput}
          onClick={(e) => {
            e.preventDefault();
            setShowInput(true);
          }}
        >
          {i18n("add")}
        </Button>
        <HelpButton />
      </Stack>

      {showInput && (
        <>
          <TextField
            size="small"
            value={inputText}
            error={!!inputError}
            helperText={inputError}
            onChange={handleInput}
            onFocus={handleFocus}
            label={i18n("subscribe_url")}
          />

          <Stack direction="row" alignItems="center" spacing={2}>
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={loading}
            >
              {i18n("save")}
            </Button>
            <Button size="small" variant="outlined" onClick={handleCancel}>
              {i18n("cancel")}
            </Button>
          </Stack>
        </>
      )}
    </>
  );
}

function SubRules({ subRules }) {
  const {
    subList,
    selectSub,
    addSub,
    delSub,
    selectedUrl,
    selectedRules,
    setSelectedRules,
    loading,
  } = subRules;

  const handleSelect = (e) => {
    const url = e.target.value;
    selectSub(url);
  };

  return (
    <Stack spacing={3}>
      <SubRulesEdit subList={subList} addSub={addSub} />

      <RadioGroup value={selectedUrl} onChange={handleSelect}>
        {subList.map((item, index) => (
          <SubRulesItem
            key={item.url}
            url={item.url}
            index={index}
            selectedUrl={selectedUrl}
            delSub={delSub}
            setSelectedRules={setSelectedRules}
          />
        ))}
      </RadioGroup>

      <Box>
        {loading ? (
          <center>
            <CircularProgress />
          </center>
        ) : (
          selectedRules.map((rule) => (
            <RuleAccordion key={rule.pattern} rule={rule} />
          ))
        )}
      </Box>
    </Stack>
  );
}

export default function Rules() {
  const i18n = useI18n();
  const [activeTab, setActiveTab] = useState(0);
  const subRules = useSubRules();

  const handleTabChange = (e, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="info">
          {i18n("rules_warn_1")}
          <br />
          {i18n("rules_warn_2")}
        </Alert>

        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label={i18n("personal_rules")} />
            <Tab label={i18n("subscribe_rules")} />
            <Tab label={i18n("overwrite_subscribe_rules")} />
          </Tabs>
        </Box>
        <div hidden={activeTab !== 0}>
          {activeTab === 0 && <UserRules subRules={subRules} />}
        </div>
        <div hidden={activeTab !== 1}>
          {activeTab === 1 && <SubRules subRules={subRules} />}
        </div>
        <div hidden={activeTab !== 2}>{activeTab === 2 && <OwSubRule />}</div>
      </Stack>
    </Box>
  );
}
