import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useI18n } from "../../hooks/I18n";
import { useSync } from "../../hooks/Sync";
import { syncAll } from "../../libs/sync";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import { URL_KISS_WORKER } from "../../config";

export default function SyncSetting() {
  const i18n = useI18n();
  const sync = useSync();

  if (!sync.opt) {
    return;
  }

  const { syncUrl, syncKey } = sync.opt;
  const handleSyncBlur = () => {
    syncAll();
  };

  return (
    <Box>
      <Stack spacing={3}>
        <Alert severity="warning">{i18n("sync_warn")}</Alert>

        <TextField
          size="small"
          label={i18n("data_sync_url")}
          defaultValue={syncUrl}
          onChange={(e) => {
            sync.update({
              syncUrl: e.target.value,
            });
          }}
          onBlur={handleSyncBlur}
          helperText={
            <Link href={URL_KISS_WORKER}>{i18n("about_sync_api")}</Link>
          }
        />

        <TextField
          size="small"
          type="password"
          label={i18n("data_sync_key")}
          defaultValue={syncKey}
          onChange={(e) => {
            sync.update({
              syncKey: e.target.value,
            });
          }}
          onBlur={handleSyncBlur}
        />
      </Stack>
    </Box>
  );
}
