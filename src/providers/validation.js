import { providerError } from "./capabilities";
import { translationProtocol } from "./sdk/translation";

const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string";
const finite = (value) => Number.isFinite(value);
const probability = (value) => finite(value) && value >= 0 && value <= 1;
const asset = (value) =>
  object(value) && /^asset-\d+$/.test(value.assetId) && text(value.mimeType);
const polygon = (value) =>
  Array.isArray(value) &&
  value.length >= 3 &&
  value.every(
    (point) => Array.isArray(point) && point.length === 2 && point.every(finite)
  ) &&
  Math.abs(
    value.reduce((area, [x, y], index) => {
      const [nx, ny] = value[(index + 1) % value.length];
      return area + x * ny - nx * y;
    }, 0)
  ) > 0;
const interval = (value) =>
  finite(value.start) &&
  finite(value.end) &&
  value.start >= 0 &&
  value.end >= value.start;
const requireValue = (valid, code, message) => {
  if (!valid) throw providerError(code, message);
};
export function payloadSize(value) {
  return new Blob([JSON.stringify(value)]).size;
}
export function checkPayloadBudget(value) {
  const size = payloadSize(value);
  requireValue(
    size <= 8 * 1024 * 1024,
    "RESOURCE_BUDGET_EXCEEDED",
    "Payload exceeds 8 MiB."
  );
  return size;
}

function items(value, code) {
  requireValue(
    Array.isArray(value) && value.length > 0,
    code,
    "Items must be a nonempty array."
  );
  const ids = new Set();
  for (const item of value) {
    requireValue(
      object(item) &&
        text(item.id) &&
        item.id.length > 0 &&
        text(item.text) &&
        !ids.has(item.id),
      code,
      "Items require unique string IDs and text."
    );
    ids.add(item.id);
  }
  return ids;
}

/** Validation runs at the execution boundary too; a stale scene can bypass UI filtering. */
export function validateInput(capability, input) {
  checkPayloadBudget(input);
  const code = "INVALID_INPUT";
  requireValue(object(input), code, "Capability input must be an object.");
  requireValue(
    input.document === undefined ||
      (object(input.document) && Object.values(input.document).every(text)),
    code,
    "Invalid document context."
  );
  requireValue(
    input.glossary === undefined ||
      (object(input.glossary) && Object.values(input.glossary).every(text)),
    code,
    "Invalid glossary."
  );
  requireValue(
    input.tone === undefined || text(input.tone),
    code,
    "Invalid tone."
  );
  requireValue(
    input.candidates === undefined ||
      (Array.isArray(input.candidates) &&
        input.candidates.length > 0 &&
        input.candidates.every((value) => text(value) && value.trim())),
    code,
    "Invalid language candidates."
  );
  if (capability === "translate") {
    items(input.items, code);
    translationProtocol(input);
    requireValue(
      input.glossary === undefined ||
        (object(input.glossary) && Object.values(input.glossary).every(text)),
      code,
      "Invalid glossary."
    );
    requireValue(
      input.document === undefined ||
        (object(input.document) && Object.values(input.document).every(text)),
      code,
      "Invalid document context."
    );
    requireValue(
      text(input.targetLanguage) && Boolean(input.targetLanguage.trim()),
      code,
      "Target language is required."
    );
    requireValue(
      input.textFormat === undefined ||
        ["text", "html"].includes(input.textFormat),
      code,
      "Unsupported text format."
    );
  } else if (capability === "chat") {
    requireValue(
      Array.isArray(input.messages) && input.messages.length > 0,
      code,
      "Chat messages are required."
    );
    for (const message of input.messages) {
      requireValue(
        object(message) &&
          ["system", "user", "assistant"].includes(message.role),
        code,
        "Invalid chat role."
      );
      const content = message.content;
      requireValue(
        text(content) ||
          (Array.isArray(content) &&
            content.length > 0 &&
            content.every(
              (part) =>
                object(part) &&
                (part.type === "text"
                  ? text(part.text)
                  : ["image", "audio"].includes(part.type) && asset(part.asset))
            )),
        code,
        "Invalid message content."
      );
    }
  } else if (capability === "segmentSubtitle") {
    items(input.items, code);
    requireValue(
      input.items.every(
        (item) =>
          interval(item) &&
          (item.pauseMs === undefined ||
            (finite(item.pauseMs) && item.pauseMs >= 0))
      ),
      code,
      "Subtitle times must be ordered seconds."
    );
  } else if (capability === "transcribe") {
    requireValue(asset(input.audio), code, "Audio asset is required.");
    requireValue(
      input.requireTimestamps === undefined ||
        typeof input.requireTimestamps === "boolean",
      code,
      "requireTimestamps must be boolean."
    );
  } else if (
    ["recognizeText", "parseImage", "analyzeLayout"].includes(capability)
  )
    requireValue(asset(input.image), code, "Image asset is required.");
  else if (capability === "evaluate") {
    requireValue(
      input.state !== undefined &&
        object(input.questions) &&
        Object.keys(input.questions).length > 0,
      code,
      "Decision state and questions are required."
    );
    for (const question of Object.values(input.questions))
      requireValue(
        object(question) &&
          ["choice", "score", "noul"].includes(question.type) &&
          question.instructions !== undefined &&
          (question.type === "noul" ||
            (question.type === "choice"
              ? object(question.criteria) &&
                Object.keys(question.criteria).length > 0 &&
                Object.keys(question.criteria).every(
                  (key) => key.trim().length > 0
                )
              : Array.isArray(question.criteria))),
        code,
        "Invalid decision question."
      );
  } else
    requireValue(
      text(input.text) && Boolean(input.text.trim()),
      code,
      "Text is required."
    );
  for (const name of [
    "language",
    "sourceLanguage",
    "targetLanguage",
    "instructions",
    "systemPrompt",
    "userPrompt",
    "context",
    "voice",
  ])
    requireValue(
      input[name] === undefined || text(input[name]),
      code,
      `Invalid ${name}.`
    );
  requireValue(
    input.speed === undefined || (finite(input.speed) && input.speed > 0),
    code,
    "Speed must be positive."
  );
  if (input.imageSize !== undefined)
    requireValue(
      object(input.imageSize) &&
        input.imageSize.width > 0 &&
        finite(input.imageSize.width) &&
        input.imageSize.height > 0 &&
        finite(input.imageSize.height),
      code,
      "Invalid image dimensions."
    );
  if (["recognizeText", "parseImage"].includes(capability))
    requireValue(
      input.mode === undefined ||
        ["doc", "table", "formula"].includes(input.mode),
      code,
      "Invalid image task mode."
    );
}

/** Never turn a malformed final response into a successful cache entry. */
export function validateResult(capability, result, input, descriptor = {}) {
  checkPayloadBudget(result);
  const code = "INVALID_RESPONSE";
  requireValue(object(result), code, "Capability result must be an object.");
  if (capability === "translate") {
    const expected = new Set(input.items.map((item) => item.id));
    requireValue(
      result.sourceLanguage === undefined || text(result.sourceLanguage),
      code,
      "Invalid source language."
    );
    const actual = items(result.items, code);
    requireValue(
      actual.size === expected.size &&
        [...actual].every((id) => expected.has(id)),
      code,
      "Translation IDs do not cover the input."
    );
  } else if (capability === "segmentSubtitle") {
    requireValue(
      Array.isArray(result.groups) && result.groups.length > 0,
      code,
      "Subtitle groups are required."
    );
    let cursor = 0;
    for (const group of result.groups) {
      requireValue(
        object(group) &&
          Array.isArray(group.ids) &&
          group.ids.length > 0 &&
          text(group.text) &&
          (group.translation === undefined || text(group.translation)),
        code,
        "Invalid subtitle group."
      );
      for (const id of group.ids)
        requireValue(
          cursor < input.items.length && id === input.items[cursor++].id,
          code,
          "Subtitle groups must cover input once in order."
        );
    }
    requireValue(
      cursor === input.items.length,
      code,
      "Missing subtitle items."
    );
  } else if (capability === "detectLanguage") {
    requireValue(
      text(result.language) &&
        result.language.length > 0 &&
        (result.confidence === undefined || probability(result.confidence)),
      code,
      "Invalid detected language."
    );
    requireValue(
      !input.candidates || input.candidates.includes(result.language),
      code,
      "Detected language is outside candidates."
    );
  } else if (capability === "suggest")
    requireValue(
      Array.isArray(result.items) && result.items.every(text),
      code,
      "Invalid suggestions."
    );
  else if (capability === "synthesizeSpeech")
    requireValue(
      asset(result.audio) &&
        text(result.mimeType) &&
        result.mimeType === result.audio.mimeType,
      code,
      "Invalid synthesized audio."
    );
  else if (capability === "speak")
    requireValue(
      ["ended", "interrupted"].includes(result.status),
      code,
      "Invalid speech status."
    );
  else if (capability === "analyzeLayout")
    requireValue(
      Array.isArray(result.regions) &&
        result.regions.every(
          (region) =>
            object(region) &&
            text(region.type) &&
            polygon(region.poly) &&
            Number.isInteger(region.order) &&
            region.order >= 0
        ),
      code,
      "Invalid layout regions."
    );
  else if (capability === "evaluate") {
    requireValue(
      object(result.answers) && text(result.model) && object(result.usage),
      code,
      "Invalid decision result."
    );
    requireValue(
      Object.keys(result.answers).length ===
        Object.keys(input.questions).length,
      code,
      "Missing decision answers."
    );
    for (const [id, question] of Object.entries(input.questions)) {
      const answer = result.answers[id];
      requireValue(
        object(answer) &&
          answer.type === question.type &&
          (answer.confidence === undefined || probability(answer.confidence)) &&
          (answer.action === undefined ||
            (object(answer.action) &&
              probability(answer.action.act_probability))),
        code,
        "Invalid decision answer."
      );
      requireValue(
        question.type === "choice"
          ? text(answer.choice) &&
              Object.hasOwn(question.criteria, answer.choice)
          : question.type === "score"
            ? finite(answer.score)
            : probability(answer.noul),
        code,
        "Invalid decision value."
      );
    }
  } else {
    requireValue(text(result.text), code, "Text result is required.");
    if (capability === "dictionary")
      requireValue(
        ["text", "markdown"].includes(result.format),
        code,
        "Invalid dictionary format."
      );
    if (capability === "chat")
      requireValue(
        result.reasoning === undefined || text(result.reasoning),
        code,
        "Invalid reasoning text."
      );
    if (capability === "transcribe") {
      requireValue(
        result.language === undefined ||
          (text(result.language) && result.language.length <= 64),
        code,
        "Invalid transcription language."
      );
      requireValue(
        result.languageConfidence === undefined ||
          probability(result.languageConfidence),
        code,
        "Invalid language confidence."
      );
      requireValue(
        result.languagePending === undefined ||
          typeof result.languagePending === "boolean",
        code,
        "Invalid language detection state."
      );
      requireValue(
        result.segments === undefined ||
          (Array.isArray(result.segments) &&
            result.segments.every(
              (segment) =>
                object(segment) && interval(segment) && text(segment.text)
            )),
        code,
        "Invalid transcription segments."
      );
      requireValue(
        !(input.requireTimestamps ?? descriptor.timestamps) ||
          (Array.isArray(result.segments) &&
            (!result.text.trim() ||
              result.segments.some(
                (segment) => segment.text.trim() && segment.end > segment.start
              ))),
        code,
        "Declared timestamps are missing."
      );
    }
    if (["recognizeText", "parseImage"].includes(capability)) {
      requireValue(
        ["text", "markdown"].includes(result.format),
        code,
        "Invalid OCR format."
      );
      requireValue(
        result.items === undefined ||
          (Array.isArray(result.items) &&
            result.items.every(
              (item) =>
                object(item) &&
                text(item.text) &&
                (item.poly === null || polygon(item.poly)) &&
                (item.confidence === undefined || probability(item.confidence))
            )),
        code,
        "Invalid OCR blocks."
      );
      requireValue(
        !descriptor.coordinates ||
          (Array.isArray(result.items) &&
            result.items.filter((item) => item.text.trim()).length > 0 &&
            result.items
              .filter((item) => item.text.trim())
              .every((item) => polygon(item.poly))),
        code,
        "Declared coordinates are missing."
      );
    }
  }
  return result;
}

export function validateEvent(capability, event, input) {
  requireValue(object(event), "INVALID_EVENT", "Event must be an object.");
  if (["text.delta", "reasoning.delta"].includes(event.type))
    requireValue(text(event.text), "INVALID_EVENT", "Invalid text event.");
  else if (["item.delta", "item.complete"].includes(event.type))
    requireValue(
      capability === "translate" &&
        input.items.some((item) => item.id === event.id) &&
        text(event.text),
      "INVALID_EVENT",
      "Invalid item event."
    );
  else if (event.type === "progress")
    requireValue(
      (event.progress === undefined || probability(event.progress)) &&
        (event.message === undefined || text(event.message)),
      "INVALID_EVENT",
      "Invalid progress event."
    );
  else throw providerError("INVALID_EVENT", "Unsupported event type.");
}
