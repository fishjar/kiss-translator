// Decide defaults from raw templates, never from rendered input data.
export function hasPromptPair(system, user) {
  return Boolean(String(system ?? "").trim() || String(user ?? "").trim());
}

export function resolvePromptPair(system, user, defaults) {
  return hasPromptPair(system, user)
    ? { systemPrompt: system ?? "", userPrompt: user ?? "" }
    : {
        systemPrompt: defaults?.systemPrompt ?? "",
        userPrompt: defaults?.userPrompt ?? "",
      };
}

// Remove only empty standalone placeholders; static labels belong to the template.
export function renderTemplate(template, values) {
  return String(template ?? "")
    .replace(
      /^[ \t]*\{\{([A-Za-z][\w]*)\}\}[ \t]*(?:\r?\n|$)/gm,
      (match, key) =>
        Object.hasOwn(values, key) && (values[key] ?? "") === "" ? "" : match
    )
    .replace(/\{\{([A-Za-z][\w]*)\}\}/g, (match, key) =>
      Object.hasOwn(values, key) ? String(values[key] ?? "") : match
    );
}

export function assertPromptMessages(system, user) {
  if (!hasPromptPair(system, user)) {
    const error = new Error("系统提示词和用户提示词均为空，请至少填写一个模板");
    error.code = "INVALID_INPUT";
    throw error;
  }
}
