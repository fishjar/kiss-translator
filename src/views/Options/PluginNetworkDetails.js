import { useProviderI18n } from "../../hooks/ProviderI18n";
import { useI18n } from "../../hooks/I18n";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { capabilityLabelKeys } from "../../providers/capabilityLabels";

export default function PluginNetworkDetails({ summary }) {
  const providerText = useProviderI18n();
  const i18n = useI18n();
  const capabilities = [
    ...new Set(summary.services.flatMap((service) => service.capabilities)),
  ];
  const section = (title, content) => (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "112px minmax(0, 1fr)" },
        gap: 1.5,
        alignItems: "start",
        minWidth: 0,
      }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ pt: { sm: 0.5 } }}
      >
        {title}
      </Typography>
      {content}
    </Box>
  );
  return (
    <Stack spacing={2} useFlexGap sx={{ minWidth: 0 }}>
      {section(
        i18n("plugin_fixed_network_addresses"),
        summary.origins.length ? (
          <Stack spacing={1} useFlexGap>
            {summary.origins.map((origin) => {
              return (
                <Box
                  key={origin}
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 1,
                    alignItems: "center",
                    bgcolor: "action.hover",
                    px: 1.5,
                    py: 1,
                    borderRadius: 1.5,
                    minWidth: 0,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      flex: "1 1 160px",
                      minWidth: 0,
                      overflowWrap: "anywhere",
                      fontFamily: "monospace",
                    }}
                  >
                    {origin}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        ) : (
          <Typography variant="body2">
            {i18n("plugin_no_fixed_addresses")}
          </Typography>
        )
      )}
      {section(
        i18n("plugin_linked_services"),
        <Stack spacing={1} useFlexGap sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {summary.services.map((service) => (
              <Chip
                key={service.id}
                size="small"
                label={providerText(
                  service.name || service.id,
                  service.nameI18n
                )}
                variant="outlined"
                sx={{
                  maxWidth: "100%",
                  height: "auto",
                  "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 },
                }}
              />
            ))}
          </Stack>
          {capabilities.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {i18n("plugin_capabilities")}
              {capabilities
                .map((name) => i18n(capabilityLabelKeys[name], name))
                .join("、")}
            </Typography>
          )}
        </Stack>
      )}
    </Stack>
  );
}
