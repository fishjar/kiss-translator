import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useI18n } from "../../hooks/I18n";
import { useSync } from "../../hooks/Sync";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import { URL_KISS_WORKER } from "../../config";
import { useState } from "react";
import { syncSettingAndRules } from "../../libs/sync";
import Button from "@mui/material/Button";
import { useAlert } from "../../hooks/Alert";
import SyncIcon from "@mui/icons-material/Sync";
import CircularProgress from "@mui/material/CircularProgress";
import { useSetting } from "../../hooks/Setting";

export default function SyncSetting() {
  const i18n = useI18n();
  const { sync, updateSync } = useSync();
  const alert = useAlert();
  const [loading, setLoading] = useState(false);
  const { reloadSetting } = useSetting();

  const handleChange = async (e) => {
    e.preventDefault();
    const { name, value } = e.target;
    await updateSync({
      [name]: value,
    });
  };

  const handleSyncTest = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await syncSettingAndRules();
      await reloadSetting();
      alert.success(i18n("sync_success"));
    } catch (err) {
      console.log("[sync all]", err);
      alert.error(i18n("sync_failed"));
    } finally {
      setLoading(false);
    }
  };

  const { syncUrl = "", syncKey = "" } = sync;

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="warning">{i18n("sync_warn")}</Alert>

        <TextField
          size="small"
          label={i18n("data_sync_url")}
          name="syncUrl"
          value={syncUrl}
          onChange={handleChange}
          helperText={
            <Link href={URL_KISS_WORKER} target="_blank">
              {i18n("about_sync_api")}
            </Link>
          }
        />

        <TextField
          size="small"
          type="password"
          label={i18n("data_sync_key")}
          name="syncKey"
          value={syncKey}
          onChange={handleChange}
        />

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
            disabled={!syncUrl || !syncKey || loading}
            onClick={handleSyncTest}
            startIcon={<SyncIcon />}
          >
            {i18n("sync_now")}
          </Button>
          {loading && <CircularProgress size={16} />}
        </Stack>
      </Stack>
    </Box>
  );
}
