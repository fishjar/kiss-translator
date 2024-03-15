import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../hooks/I18n";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useSetting } from "../../hooks/Setting";
import CircularProgress from "@mui/material/CircularProgress";
import { syncWebfix, loadOrFetchWebfix, FIXER_ALL } from "../../libs/webfix";
import Button from "@mui/material/Button";
import SyncIcon from "@mui/icons-material/Sync";
import { useAlert } from "../../hooks/Alert";
import HelpButton from "./HelpButton";
import { URL_KISS_RULES_NEW_ISSUE } from "../../config";
import MenuItem from "@mui/material/MenuItem";
import { useWebfixRules } from "../../hooks/WebfixRules";

function WebfixFields({ rule, webfix, setShow }) {
  const editMode = !!rule;
  const initFormValues = rule || {
    pattern: "",
    selector: "",
    rootSelector: "",
    fixer: FIXER_ALL[0],
  };
  const i18n = useI18n();
  const [disabled, setDisabled] = useState(editMode);
  const [errors, setErrors] = useState({});
  const [formValues, setFormValues] = useState(initFormValues);

  const { pattern, selector, rootSelector, fixer } = formValues;

  const hasSamePattern = (str) => {
    for (const item of webfix.list || []) {
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
    if (!selector.trim()) {
      errors.selector = i18n("error_cant_be_blank");
    }
    if (Object.keys(errors).length > 0) {
      setErrors(errors);
      return;
    }

    if (editMode) {
      // 编辑
      setDisabled(true);
      webfix.put(rule.pattern, formValues);
    } else {
      // 添加
      webfix.add(formValues);
      setShow(false);
      setFormValues(initFormValues);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={3}>
        <TextField
          size="small"
          label={i18n("pattern")}
          error={!!errors.pattern}
          helperText={errors.pattern}
          name="pattern"
          value={pattern}
          disabled={disabled}
          onChange={handleChange}
          onFocus={handleFocus}
          multiline
        />
        <TextField
          size="small"
          label={i18n("root_selector")}
          error={!!errors.rootSelector}
          helperText={errors.rootSelector}
          name="rootSelector"
          value={rootSelector}
          disabled={disabled}
          onChange={handleChange}
          onFocus={handleFocus}
          multiline
        />
        <TextField
          size="small"
          label={i18n("selector")}
          error={!!errors.selector}
          helperText={errors.selector}
          name="selector"
          value={selector}
          disabled={disabled}
          onChange={handleChange}
          onFocus={handleFocus}
          multiline
        />
        <TextField
          select
          size="small"
          name="fixer"
          value={fixer}
          label={i18n("fixer_function")}
          helperText={i18n("fixer_function_helper")}
          disabled={disabled}
          onChange={handleChange}
        >
          {FIXER_ALL.map((item) => (
            <MenuItem key={item} value={item}>
              {item}
            </MenuItem>
          ))}
        </TextField>

        {webfix &&
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
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={(e) => {
                      e.preventDefault();
                      webfix.del(rule.pattern);
                    }}
                  >
                    {i18n("delete")}
                  </Button>
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

function WebfixAccordion({ rule, webfix }) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (e) => {
    setExpanded((pre) => !pre);
  };

  return (
    <Accordion expanded={expanded} onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography
          sx={{
            opacity: webfix ? 1 : 0.5,
            overflowWrap: "anywhere",
          }}
        >
          {rule.pattern}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && <WebfixFields rule={rule} webfix={webfix} />}
      </AccordionDetails>
    </Accordion>
  );
}

export default function Webfix() {
  const [loading, setLoading] = useState(false);
  const [sites, setSites] = useState([]);
  const i18n = useI18n();
  const alert = useAlert();
  const { setting, updateSetting } = useSetting();
  const [showAdd, setShowAdd] = useState(false);
  const webfix = useWebfixRules();

  const loadSites = useCallback(async () => {
    const sites = await loadOrFetchWebfix(process.env.REACT_APP_WEBFIXURL);
    setSites(sites);
  }, []);

  const handleSyncTest = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await syncWebfix(process.env.REACT_APP_WEBFIXURL);
      await loadSites();
      alert.success(i18n("sync_success"));
    } catch (err) {
      console.log("[sync webfix]", err);
      alert.error(i18n("sync_failed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadSites();
      } catch (err) {
        console.log("[load webfix]", err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadSites]);

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="info">{i18n("patch_setting_help")}</Alert>

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

          <Button
            size="small"
            variant="outlined"
            disabled={loading}
            onClick={handleSyncTest}
            startIcon={<SyncIcon />}
          >
            {i18n("sync_now")}
          </Button>
          <HelpButton url={URL_KISS_RULES_NEW_ISSUE} />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={!!setting.injectWebfix}
                onChange={() => {
                  updateSetting({
                    injectWebfix: !setting.injectWebfix,
                  });
                }}
              />
            }
            label={i18n("inject_webfix")}
          />
        </Stack>

        {showAdd && <WebfixFields webfix={webfix} setShow={setShowAdd} />}

        {webfix.list?.length > 0 && (
          <Box>
            {webfix.list.map((rule) => (
              <WebfixAccordion key={rule.pattern} rule={rule} webfix={webfix} />
            ))}
          </Box>
        )}

        {setting.injectWebfix && (
          <Box>
            {loading ? (
              <center>
                <CircularProgress size={16} />
              </center>
            ) : (
              sites.map((rule) => (
                <WebfixAccordion key={rule.pattern} rule={rule} />
              ))
            )}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
