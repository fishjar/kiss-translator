import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { newI18n } from "../../config/i18n";
import { useI18n } from "../../hooks/I18n";

/** Validation describes a draft; it must not decide whether that draft is saved. */
export function describeConfigurationError(
  error,
  fields = [],
  i18n = newI18n("zh"),
  providerText = (text) => text
) {
  const match =
    /^(Required field|Invalid number|Invalid boolean|Invalid text|Invalid selection): (.+)$/.exec(
      error.message
    );
  if (!match) return error.message;
  const field = fields.find((field) => field.key === match[2]);
  const label = providerText(field?.label || match[2], field?.labelI18n);
  const descriptions = {
    "Required field": i18n("plugin_missing_value"),
    "Invalid number": i18n(
      "plugin_number_is_out_of_range_or_incorrectly_formatted"
    ),
    "Invalid boolean": i18n("plugin_invalid_switch_value"),
    "Invalid text": i18n("plugin_invalid_text_format"),
    "Invalid selection": i18n(
      "plugin_selected_value_is_not_among_the_declared_options"
    ),
  };
  return `${label} ${descriptions[match[1]]}`;
}

export default function useServiceFeedback() {
  const i18n = useI18n();
  const [feedback, setFeedback] = useState(null);
  const close = () => setFeedback(null);
  return {
    showFeedback: setFeedback,
    feedbackDialog: (
      <Dialog
        open={Boolean(feedback)}
        onClose={close}
        fullWidth
        maxWidth="sm"
        aria-labelledby="service-feedback-title"
      >
        {feedback && (
          <>
            <DialogTitle id="service-feedback-title">
              {feedback.title}
            </DialogTitle>
            <DialogContent>
              <Alert
                severity={feedback.severity || "warning"}
                sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
              >
                {feedback.message}
              </Alert>
            </DialogContent>
            <DialogActions>
              <Button onClick={close} autoFocus>
                {i18n("service_feedback_acknowledge", "知道了")}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    ),
  };
}
