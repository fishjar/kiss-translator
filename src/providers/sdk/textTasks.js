import { providerError } from "../capabilities";
import { validateResult } from "../validation";
import defaults from "./defaultTextTaskPrompts.json";

const contracts = {
  segmentSubtitle:
    'Return only JSON {"groups":[{"ids":["input ID"],"text":"merged source","translation":"translation"}]}. IDs must cover every input exactly once in input order.',
  detectLanguage:
    'Return only JSON {"language":"ISO language code","confidence":0.9}. If candidates are supplied, choose one of those codes.',
  suggest: 'Return only JSON {"items":["suggestion"]}.',
  evaluate:
    'Return only JSON {"answers":{"question ID":{"type":"choice|score|noul","choice":"selected criterion","score":0,"noul":0,"confidence":0.9,"action":{"act_probability":0.5}}}}. Cover every question exactly once. Each answer must match its question type: choice uses choice, score uses score, noul uses noul. Probabilities must be between 0 and 1.',
  analyzeLayout:
    'Return only JSON {"regions":[{"type":"text","poly":[[0,0],[100,0],[100,50],[0,50]],"order":0}]}. Coordinates must describe actual regions in image pixels. Do not fabricate regions. Use the supplied image dimensions when present.',
};
const visualTasks = ["recognizeText", "parseImage", "analyzeLayout"];

export function buildTextTaskMessages(task, input, descriptor = {}) {
  const prompt = defaults[task === "segmentSubtitle" ? "subtitle" : task];
  if (!prompt)
    throw providerError("TASK_UNSUPPORTED", "Unsupported text or visual task.");
  const values = {
    text: input.text || "",
    transcript: input.text || "",
    sourceLanguage: input.sourceLanguage || "auto",
    targetLanguage: input.targetLanguage || input.language || "auto",
    language: input.language || input.targetLanguage || "auto",
    context: input.context || "",
    summary: input.document?.summary || "",
    title: input.document?.title || "",
    description: input.document?.description || "",
    url: input.document?.url || "",
    tone: input.tone || "",
    glossary: Object.entries(input.glossary || {})
      .map(([key, value]) => `- ${key}: ${value}`)
      .join("\n"),
    items: JSON.stringify(input.items || []),
  };
  Object.assign(values, {
    from: values.sourceLanguage,
    fromLang: values.sourceLanguage,
    to: values.targetLanguage,
    toLang: values.targetLanguage,
  });
  const render = (template) =>
    template.replace(/\{\{([A-Za-z][\w]*)\}\}/g, (match, key) =>
      Object.hasOwn(values, key) ? values[key] : match
    );
  let contract = contracts[task];
  if (["recognizeText", "parseImage"].includes(task) && descriptor.coordinates)
    contract =
      'Return only JSON {"text":"all extracted text","format":"text","items":[{"text":"region text","poly":[[0,0],[100,0],[100,50],[0,50]]}]}. Return actual text region polygons in image pixels, never invented or whole-image fallback boxes.';
  let user = render(input.userPrompt ?? prompt.userPrompt ?? "{{text}}");
  if (task === "segmentSubtitle") user = values.items;
  if (task === "detectLanguage")
    user = JSON.stringify({ text: input.text, candidates: input.candidates });
  if (task === "evaluate")
    user = JSON.stringify({ state: input.state, questions: input.questions });
  if (visualTasks.includes(task)) {
    const details = contract
      ? `\nWire output contract (overrides other output formatting): ${contract}\nImage dimensions: ${JSON.stringify(input.imageSize || null)}.`
      : "";
    return [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: render(input.prompt ?? prompt.userPrompt) + details,
          },
          { type: "image", asset: input.image },
        ],
      },
    ];
  }
  return [
    {
      role: "system",
      content:
        render(input.instructions ?? prompt.systemPrompt ?? "") +
        (contract
          ? `\nWire output contract: ${contract} This wire format replaces any output format in the task instructions.`
          : ""),
    },
    { role: "user", content: user },
  ];
}

export function parseTextTaskResult(task, text, input, descriptor = {}) {
  if (!Object.hasOwn(defaults, task === "segmentSubtitle" ? "subtitle" : task))
    throw providerError("TASK_UNSUPPORTED", "Unsupported text or visual task.");
  if (typeof text !== "string" || !text.trim())
    throw providerError("INVALID_RESPONSE", "Empty task response.");
  let result;
  if (task === "dictionary") result = { text, format: "markdown" };
  else if (task === "summarize") result = { text };
  else if (
    ["recognizeText", "parseImage"].includes(task) &&
    !descriptor.coordinates
  )
    result = {
      text,
      format: descriptor.format || "markdown",
      items: text
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => ({ text: line, poly: null })),
    };
  else {
    try {
      result = JSON.parse(
        text
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, "")
      );
    } catch {
      throw providerError("INVALID_RESPONSE", "Invalid task JSON.");
    }
  }
  if (task === "evaluate")
    result = {
      ...result,
      model: descriptor.model || "unknown",
      usage: descriptor.usage || {},
    };
  validateResult(task, result, input, descriptor);
  return result;
}
