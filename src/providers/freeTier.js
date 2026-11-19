export const freeTierLabelKeys = {
  free: "plugin_free",
  "quota-limited": "plugin_free_quota_limited",
  "some-models": "plugin_free_some_models",
  "time-limited": "plugin_free_time_limited",
};

export const isFreeTier = (value) =>
  typeof value === "string" && Object.hasOwn(freeTierLabelKeys, value);
