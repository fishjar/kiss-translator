import { Stack, Tooltip, Typography } from "@mui/material";
import { useI18n } from "../../hooks/I18n";
import { imageParsingFeatureLabelKeys } from "../../providers/capabilityLabels";

/** Adapter declarations, independent of the instance's enabled task selection. */
export default function ImageParsingFeatures({ descriptor, children }) {
  const i18n = useI18n();
  if (!descriptor) return children || null;
  return (
    <Tooltip
      arrow
      describeChild
      title={
        <Stack spacing={0.5}>
          {Object.entries(imageParsingFeatureLabelKeys).map(
            ([field, label]) => (
              <Typography key={field} variant="caption">
                {i18n(label)}：
                {i18n(
                  descriptor[field] === true
                    ? "plugin_image_feature_supported"
                    : "plugin_image_feature_undeclared"
                )}
              </Typography>
            )
          )}
          <Typography variant="caption">
            {i18n("plugin_image_feature_hint")}
          </Typography>
        </Stack>
      }
    >
      <span tabIndex={0} style={{ display: "inline-flex" }}>
        {children}
      </span>
    </Tooltip>
  );
}
