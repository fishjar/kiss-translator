import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useI18n } from "../../hooks/I18n";
import { useSync } from "../../hooks/Sync";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import { URL_KISS_WORKER } from "../../config";
import { debounce } from "../../libs/utils";
import { useMemo } from "react";
import { syncAll } from "../../libs/sync";

export default function SyncSetting() {
  const i18n = useI18n();
  const sync = useSync();

  const handleChange = useMemo(
    () =>
      debounce(async (e) => {
        e.preventDefault();
        const { name, value } = e.target;
        await sync.update({
          [name]: value,
        });
        await syncAll();
      }, 1000),
    [sync]
  );

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
      </Stack>
    </Box>
  );
}
