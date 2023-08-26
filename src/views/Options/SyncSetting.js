import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useI18n } from "../../hooks/I18n";
import { useSync } from "../../hooks/Sync";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import { URL_KISS_WORKER } from "../../config";
import { debounce } from "../../libs/utils";
import { useMemo, useState } from "react";
import { syncAll } from "../../libs/sync";
import Button from "@mui/material/Button";
import { useAlert } from "../../hooks/Alert";
import SyncIcon from "@mui/icons-material/Sync";
import CircularProgress from "@mui/material/CircularProgress";

export default function SyncSetting() {
  const i18n = useI18n();
  const sync = useSync();
  const alert = useAlert();
  const [loading, setLoading] = useState(false);

  const handleChange = useMemo(
    () =>
      debounce(async (e) => {
        e.preventDefault();
        const { name, value } = e.target;
        await sync.update({
          [name]: value,
        });
        // trySyncAll();
      }, 500),
    [sync]
  );

  const handleSyncTest = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await syncAll();
      alert.success(i18n("data_sync_success"));
    } catch (err) {
      console.log("[sync all]", err);
      alert.error(i18n("data_sync_error"));
    } finally {
      setLoading(false);
    }
  };

  if (!sync.opt) {
    return;
  }

  const { syncUrl, syncKey } = sync.opt;

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="warning">{i18n("sync_warn")}</Alert>

        <TextField
          size="small"
          label={i18n("data_sync_url")}
          name="syncUrl"
          defaultValue={syncUrl}
          onChange={handleChange}
          helperText={
            <Link href={URL_KISS_WORKER}>{i18n("about_sync_api")}</Link>
          }
        />

        <TextField
          size="small"
          type="password"
          label={i18n("data_sync_key")}
          name="syncKey"
          defaultValue={syncKey}
          onChange={handleChange}
        />

        <Stack direction="row" alignItems="center" spacing={2} useFlexGap flexWrap="wrap">
          <Button
            size="small"
            variant="contained"
            disabled={!syncUrl || !syncKey || loading}
            onClick={handleSyncTest}
            startIcon={<SyncIcon />}
          >
            {i18n("data_sync_test")}
          </Button>
          {loading && <CircularProgress size={16} />}
        </Stack>
      </Stack>
    </Box>
  );
}
