/** Storage uses JSON strings on every platform. Malformed writes are not a disable action. */
export function availableServiceIds(raw) {
  if (raw === undefined || raw === null) return new Set();
  let setting;
  try {
    setting = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!Array.isArray(setting?.transApis)) return null;
  return new Set(
    setting.transApis.filter((api) => !api.isDisabled).map((api) => api.apiSlug)
  );
}
