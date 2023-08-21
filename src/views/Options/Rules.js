import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import {
  GLOBAL_KEY,
  DEFAULT_RULE,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  OPT_TRANS_ALL,
  OPT_STYLE_ALL,
} from "../../config";
import { useState, useRef, useEffect } from "react";
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
import { useSetting, useSettingUpdate } from "../../hooks/Setting";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import DeleteIcon from "@mui/icons-material/Delete";
import IconButton from "@mui/material/IconButton";
import ShareIcon from "@mui/icons-material/Share";
import SyncIcon from "@mui/icons-material/Sync";
import { useSubrules } from "../../hooks/Rules";
import { rulesCache, tryLoadRules } from "../../libs/rules";
import { useAlert } from "../../hooks/Alert";
import { loadSyncOpt, syncShareRules } from "../../libs/sync";

function RuleFields({ rule, rules, setShow }) {
  const initFormValues = rule || { ...DEFAULT_RULE, transOpen: "true" };
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

  const globalItem = rule?.pattern !== "*" && (
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
                {globalItem}
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
                {globalItem}
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
                {globalItem}
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
                {globalItem}
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
                {globalItem}
                {OPT_STYLE_ALL.map((item) => (
                  <MenuItem key={item} value={item}>
                    {i18n(item)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
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
          </Grid>
        </Box>

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

function ShareButton({ rules, injectRules, selectedSub }) {
  const alert = useAlert();
  const i18n = useI18n();
  const handleClick = async () => {
    try {
      const { syncUrl, syncKey } = await loadSyncOpt();
      if (!syncUrl || !syncKey) {
        alert.warning(i18n("error_sync_setting"));
        return;
      }

      const shareRules = [...rules.list];
      if (injectRules) {
        const subRules = await tryLoadRules(selectedSub?.url);
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
      {"分享"}
    </Button>
  );
}

function UserRules() {
  const i18n = useI18n();
  const rules = useRules();
  const [showAdd, setShowAdd] = useState(false);
  const setting = useSetting();
  const updateSetting = useSettingUpdate();
  const subrules = useSubrules();
  const selectedSub = subrules.list.find((item) => item.selected);

  const injectRules = !!setting?.injectRules;

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

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
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
          selectedSub={selectedSub}
        />

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

      {showAdd && <RuleFields rules={rules} setShow={setShowAdd} />}

      <Box>
        {rules.list.map((rule) => (
          <RuleAccordion key={rule.pattern} rule={rule} rules={rules} />
        ))}
      </Box>
    </Stack>
  );
}

function SubRulesItem({ index, url, selectedUrl, subrules, setRules }) {
  const [loading, setLoading] = useState(false);

  const handleDel = async () => {
    try {
      await subrules.del(url);
      await rulesCache.del(url);
    } catch (err) {
      console.log("[del subrules]", err);
    }
  };

  const handleSync = async () => {
    try {
      setLoading(true);
      const rules = await rulesCache.fetch(url);
      await rulesCache.set(url, rules);
      if (url === selectedUrl) {
        setRules(rules);
      }
    } catch (err) {
      console.log("[sync rules]", err);
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

function SubRulesEdit({ subrules }) {
  const i18n = useI18n();
  const [inputText, setInputText] = useState("");
  const [inputError, setInputError] = useState("");
  const [showInput, setShowInput] = useState(false);

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

    if (subrules.list.find((item) => item.url === url)) {
      setInputError(i18n("error_duplicate_values"));
      return;
    }

    try {
      const rules = await rulesCache.fetch(url);
      if (rules.length === 0) {
        throw new Error("empty rules");
      }
      await rulesCache.set(url, rules);
      await subrules.add(url);
      setShowInput(false);
      setInputText("");
    } catch (err) {
      console.log("[fetch rules]", err);
      setInputError(i18n("error_fetch_url"));
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
            <Button size="small" variant="contained" onClick={handleSave}>
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

function SubRules() {
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState([]);
  const subrules = useSubrules();
  const selectedSub = subrules.list.find((item) => item.selected);

  const handleSelect = (e) => {
    const url = e.target.value;
    subrules.select(url);
  };

  useEffect(() => {
    (async () => {
      if (selectedSub?.url) {
        try {
          setLoading(true);

          const rules = await tryLoadRules(selectedSub?.url);
          setRules(rules);
        } catch (err) {
          console.log("[load rules]", err);
        } finally {
          setLoading(false);
        }
      }
    })();
  }, [selectedSub?.url]);

  return (
    <Stack spacing={3}>
      <SubRulesEdit subrules={subrules} />

      <RadioGroup value={selectedSub?.url} onChange={handleSelect}>
        {subrules.list.map((item, index) => (
          <SubRulesItem
            key={item.url}
            url={item.url}
            index={index}
            selectedUrl={selectedSub?.url}
            subrules={subrules}
            setRules={setRules}
          />
        ))}
      </RadioGroup>

      <Box>
        {loading ? (
          <center>
            <CircularProgress />
          </center>
        ) : (
          rules.map((rule) => <RuleAccordion key={rule.pattern} rule={rule} />)
        )}
      </Box>
    </Stack>
  );
}

export default function Rules() {
  const i18n = useI18n();
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (e, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box>
      <Stack spacing={3}>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label={i18n("edit_rules")} />
            <Tab label={i18n("subscribe_rules")} />
          </Tabs>
        </Box>
        <div hidden={activeTab !== 0}>{activeTab === 0 && <UserRules />}</div>
        <div hidden={activeTab !== 1}>{activeTab === 1 && <SubRules />}</div>
      </Stack>
    </Box>
  );
}
