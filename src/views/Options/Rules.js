import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import {
  GLOBAL_KEY,
  DEFAULT_RULE,
  GLOBLA_RULE,
  OPT_LANGS_FROM,
  OPT_LANGS_TO,
  OPT_TRANS_ALL,
  OPT_STYLE_ALL,
  OPT_STYLE_DIY,
  OPT_STYLE_USE_COLOR,
  URL_KISS_RULES_NEW_ISSUE,
  OPT_SYNCTYPE_WORKER,
  OPT_TIMING_PAGESCROLL,
  DEFAULT_TRANS_TAG,
  OPT_TIMING_ALL,
} from "../../config";
import { useState, useEffect, useMemo } from "react";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useRules } from "../../hooks/Rules";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import { useSetting } from "../../hooks/Setting";
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
import { useSubRules } from "../../hooks/SubRules";
import { syncSubRules } from "../../libs/subRules";
import { loadOrFetchSubRules } from "../../libs/subRules";
import { useAlert } from "../../hooks/Alert";
import { syncShareRules } from "../../libs/sync";
import { debounce } from "../../libs/utils";
import { delSubRules, getSyncWithDefault } from "../../libs/storage";
import OwSubRule from "./OwSubRule";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import HelpButton from "./HelpButton";
import { useSyncCaches } from "../../hooks/Sync";
import DownloadButton from "./DownloadButton";
import UploadButton from "./UploadButton";
import { FIXER_ALL } from "../../libs/webfix";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import CancelIcon from "@mui/icons-material/Cancel";
import SaveIcon from "@mui/icons-material/Save";
import { kissLog } from "../../libs/log";

function RuleFields({ rule, rules, setShow, setKeyword }) {
  const initFormValues = {
    ...(rule?.pattern === "*" ? GLOBLA_RULE : DEFAULT_RULE),
    ...(rule || {}),
  };
  const editMode = !!rule;

  const i18n = useI18n();
  const [disabled, setDisabled] = useState(editMode);
  const [errors, setErrors] = useState({});
  const [formValues, setFormValues] = useState(initFormValues);
  const [showMore, setShowMore] = useState(!rules);
  const {
    pattern,
    selector,
    keepSelector = "",
    terms = "",
    selectStyle = "",
    parentStyle = "",
    injectJs = "",
    injectCss = "",
    translator,
    fromLang,
    toLang,
    textStyle,
    transOpen,
    bgColor,
    textDiyStyle,
    transOnly = "false",
    transTiming = OPT_TIMING_PAGESCROLL,
    transTag = DEFAULT_TRANS_TAG,
    transTitle = "false",
    detectRemote = "false",
    skipLangs = [],
    fixerSelector = "",
    fixerFunc = "-",
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
        <TextField
          size="small"
          label={i18n("keep_selector")}
          helperText={i18n("keep_selector_helper")}
          name="keepSelector"
          value={keepSelector}
          disabled={disabled}
          onChange={handleChange}
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
            maxRows={10}
            multiline
          />
        )}

        {showMore && (
          <>
            <Box>
              <Grid container spacing={2} columns={12}>
                <Grid item xs={12} sm={6} md={3} lg={2}>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    name="transOnly"
                    value={transOnly}
                    label={i18n("show_only_translations")}
                    disabled={disabled}
                    onChange={handleChange}
                  >
                    {GlobalItem}
                    <MenuItem value={"false"}>{i18n("disable")}</MenuItem>
                    <MenuItem value={"true"}>{i18n("enable")}</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6} md={3} lg={2}>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    name="transTiming"
                    value={transTiming}
                    label={i18n("trigger_mode")}
                    disabled={disabled}
                    onChange={handleChange}
                  >
                    {GlobalItem}
                    {OPT_TIMING_ALL.map((item) => (
                      <MenuItem key={item} value={item}>
                        {i18n(item)}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6} md={3} lg={2}>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    name="transTag"
                    value={transTag}
                    label={i18n("translation_element_tag")}
                    disabled={disabled}
                    onChange={handleChange}
                  >
                    {GlobalItem}
                    <MenuItem value={"span"}>{`<span>`}</MenuItem>
                    <MenuItem value={"font"}>{`<font>`}</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6} md={3} lg={2}>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    name="transTitle"
                    value={transTitle}
                    label={i18n("translate_page_title")}
                    disabled={disabled}
                    onChange={handleChange}
                  >
                    {GlobalItem}
                    <MenuItem value={"false"}>{i18n("disable")}</MenuItem>
                    <MenuItem value={"true"}>{i18n("enable")}</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6} md={3} lg={2}>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    name="detectRemote"
                    value={detectRemote}
                    label={i18n("detect_lang_remote")}
                    disabled={disabled}
                    onChange={handleChange}
                  >
                    {GlobalItem}
                    <MenuItem value={"false"}>{i18n("disable")}</MenuItem>
                    <MenuItem value={"true"}>{i18n("enable")}</MenuItem>
                  </TextField>
                </Grid>
              </Grid>
            </Box>

            <TextField
              select
              size="small"
              label={i18n("skip_langs")}
              helperText={i18n("skip_langs_helper")}
              name="skipLangs"
              value={skipLangs}
              disabled={disabled}
              onChange={handleChange}
              SelectProps={{
                multiple: true,
              }}
            >
              {OPT_LANGS_TO.map(([langKey, langName]) => (
                <MenuItem key={langKey} value={langKey}>
                  {langName}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              size="small"
              label={i18n("terms")}
              helperText={i18n("terms_helper")}
              name="terms"
              value={terms}
              disabled={disabled}
              onChange={handleChange}
              multiline
            />

            <TextField
              size="small"
              label={i18n("fixer_selector")}
              name="fixerSelector"
              value={fixerSelector}
              disabled={disabled}
              onChange={handleChange}
              multiline
            />
            <TextField
              select
              size="small"
              name="fixerFunc"
              value={fixerFunc}
              label={i18n("fixer_function")}
              helperText={i18n("fixer_function_helper")}
              disabled={disabled}
              onChange={handleChange}
            >
              {GlobalItem}
              {FIXER_ALL.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              size="small"
              label={i18n("selector_style")}
              helperText={i18n("selector_style_helper")}
              name="selectStyle"
              value={selectStyle}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
              multiline
            />
            <TextField
              size="small"
              label={i18n("selector_parent_style")}
              helperText={i18n("selector_style_helper")}
              name="parentStyle"
              value={parentStyle}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
              multiline
            />
            <TextField
              size="small"
              label={i18n("inject_css")}
              helperText={i18n("inject_css_helper")}
              name="injectCss"
              value={injectCss}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
              multiline
            />
            <TextField
              size="small"
              label={i18n("inject_js")}
              helperText={i18n("inject_js_helper")}
              name="injectJs"
              value={injectJs}
              disabled={disabled}
              onChange={handleChange}
              maxRows={10}
              multiline
            />
          </>
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
                    startIcon={<EditIcon />}
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
                      startIcon={<DeleteIcon />}
                    >
                      {i18n("delete")}
                    </Button>
                  )}
                  {!showMore && (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => {
                        setShowMore(true);
                      }}
                      startIcon={<ExpandMoreIcon />}
                    >
                      {i18n("more")}
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    size="small"
                    variant="contained"
                    type="submit"
                    startIcon={<SaveIcon />}
                  >
                    {i18n("save")}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleCancel}
                    startIcon={<CancelIcon />}
                  >
                    {i18n("cancel")}
                  </Button>
                  {!showMore && (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => {
                        setShowMore(true);
                      }}
                      startIcon={<ExpandMoreIcon />}
                    >
                      {i18n("more")}
                    </Button>
                  )}
                </>
              )}
            </Stack>
          ) : (
            // 添加
            <Stack direction="row" spacing={2}>
              <Button
                size="small"
                variant="contained"
                type="submit"
                startIcon={<SaveIcon />}
              >
                {i18n("save")}
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={handleCancel}
                startIcon={<CancelIcon />}
              >
                {i18n("cancel")}
              </Button>
              {!showMore && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    setShowMore(true);
                  }}
                >
                  {i18n("more")}
                </Button>
              )}
            </Stack>
          ))}
      </Stack>
    </form>
  );
}

function RuleAccordion({ rule, rules }) {
  const i18n = useI18n();
  const [expanded, setExpanded] = useState(false);

  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  return (
    <Accordion expanded={expanded} onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography
          sx={{
            opacity: rules ? 1 : 0.5,
            overflowWrap: "anywhere",
          }}
        >
          {rule.pattern === GLOBAL_KEY
            ? `[${i18n("global_rule")}] ${rule.pattern}`
            : rule.pattern}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && <RuleFields rule={rule} rules={rules} />}
      </AccordionDetails>
    </Accordion>
  );
}

function ShareButton({ rules, injectRules, selectedUrl }) {
  const alert = useAlert();
  const i18n = useI18n();
  const handleClick = async () => {
    try {
      const { syncType, syncUrl, syncKey } = await getSyncWithDefault();
      if (syncType !== OPT_SYNCTYPE_WORKER || !syncUrl || !syncKey) {
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
      kissLog(err, "share rules");
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

function UserRules({ subRules }) {
  const i18n = useI18n();
  const rules = useRules();
  const [showAdd, setShowAdd] = useState(false);
  const { setting, updateSetting } = useSetting();
  const [keyword, setKeyword] = useState("");

  const injectRules = !!setting?.injectRules;
  const { selectedUrl, selectedRules } = subRules;

  const handleImport = async (data) => {
    try {
      await rules.merge(JSON.parse(data));
    } catch (err) {
      kissLog(err, "import rules");
    }
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

  if (!rules.list) {
    return;
  }

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
          startIcon={<AddIcon />}
        >
          {i18n("add")}
        </Button>

        <UploadButton text={i18n("import")} handleImport={handleImport} />
        <DownloadButton
          handleData={() => JSON.stringify([...rules.list].reverse(), null, 2)}
          text={i18n("export")}
          fileName={`kiss-rules_${Date.now()}.json`}
        />

        <ShareButton
          rules={rules}
          injectRules={injectRules}
          selectedUrl={selectedUrl}
        />

        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            rules.clear();
          }}
          startIcon={<ClearAllIcon />}
        >
          {i18n("clear_all")}
        </Button>

        <HelpButton url={URL_KISS_RULES_NEW_ISSUE} />

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

function SubRulesItem({
  index,
  url,
  syncAt,
  selectedUrl,
  delSub,
  setSelectedRules,
  updateDataCache,
  deleteDataCache,
}) {
  const [loading, setLoading] = useState(false);

  const handleDel = async () => {
    try {
      await delSub(url);
      await delSubRules(url);
      await deleteDataCache(url);
    } catch (err) {
      kissLog(err, "del subrules");
    }
  };

  const handleSync = async () => {
    try {
      setLoading(true);
      const rules = await syncSubRules(url);
      if (rules.length > 0 && url === selectedUrl) {
        setSelectedRules(rules);
      }
      await updateDataCache(url);
    } catch (err) {
      kissLog(err, "sync sub rules");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack direction="row" alignItems="center" spacing={2}>
      <FormControlLabel
        value={url}
        control={<Radio />}
        sx={{
          overflowWrap: "anywhere",
        }}
        label={url}
      />

      {syncAt && (
        <span style={{ marginLeft: "0.5em", opacity: 0.5 }}>
          [{new Date(syncAt).toLocaleString()}]
        </span>
      )}

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

function SubRulesEdit({ subList, addSub, updateDataCache }) {
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
      await updateDataCache(url);
      setShowInput(false);
      setInputText("");
    } catch (err) {
      kissLog(err, "fetch rules");
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
          startIcon={<AddIcon />}
        >
          {i18n("add")}
        </Button>
        <HelpButton url={URL_KISS_RULES_NEW_ISSUE} />
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
              startIcon={<SaveIcon />}
            >
              {i18n("save")}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={handleCancel}
              startIcon={<CancelIcon />}
            >
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
  const { dataCaches, updateDataCache, deleteDataCache, reloadSync } =
    useSyncCaches();

  const handleSelect = (e) => {
    const url = e.target.value;
    selectSub(url);
  };

  useEffect(() => {
    reloadSync();
  }, [selectedRules, reloadSync]);

  return (
    <Stack spacing={3}>
      <SubRulesEdit
        subList={subList}
        addSub={addSub}
        updateDataCache={updateDataCache}
      />

      <RadioGroup value={selectedUrl} onChange={handleSelect}>
        {subList.map((item, index) => (
          <SubRulesItem
            key={item.url}
            url={item.url}
            syncAt={dataCaches[item.url]}
            index={index}
            selectedUrl={selectedUrl}
            delSub={delSub}
            setSelectedRules={setSelectedRules}
            updateDataCache={updateDataCache}
            deleteDataCache={deleteDataCache}
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
          <br />
          {i18n("rules_warn_3")}
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
