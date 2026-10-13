import { invokeScene } from "./sceneInvocation";
import { supportsServiceFeature } from "./features";

export async function invokeTextScene(
  api,
  capability,
  input,
  { signal, onText, nativeOptions } = {}
) {
  const streaming = Boolean(
    api.useStream !== false && supportsServiceFeature(api, "stream", capability)
  );
  const call = invokeScene(api, capability, input, {
    signal,
    nativeOptions,
    timeoutMs: (api.httpTimeout || 30) * 1000,
    streaming: streaming ? "auto" : "disabled",
  });
  let failure;
  const result = call.result.catch((error) => {
    failure = error;
  });
  let text = "";
  try {
    for await (const event of call.events) {
      if (streaming && onText && event.type === "text.delta") {
        if (typeof event.text !== "string")
          throw new Error("Invalid text event.");
        text += event.text;
        onText(text);
      }
    }
    const final = await result;
    if (failure) throw failure;
    if (typeof final?.text !== "string")
      throw new Error("Invalid text result.");
    return final.text;
  } finally {
    call.cancel();
  }
}

/** Require ordered, contiguous coverage before converting provider groups to scene cues. */
export function mapSubtitleGroups(result, events) {
  if (!Array.isArray(result?.groups))
    throw new Error("Invalid subtitle groups.");
  let cursor = 0;
  const cues = result.groups.map((group) => {
    const start = cursor;
    if (
      !Array.isArray(group.ids) ||
      !group.ids.length ||
      typeof group.text !== "string" ||
      (group.translation !== undefined && typeof group.translation !== "string")
    )
      throw new Error("Invalid subtitle group.");
    for (const id of group.ids) {
      if (cursor >= events.length || id !== String(cursor++))
        throw new Error("Subtitle groups must cover each input once in order.");
    }
    return {
      start: events[start].start,
      end: events[cursor - 1].end,
      text: group.text,
      translation: group.translation || "",
      _si: start,
      _ei: cursor - 1,
    };
  });
  if (cursor !== events.length) throw new Error("Missing subtitle groups.");
  return cues;
}

export async function segmentPlugin(
  events,
  { apiSetting, from, to, signal, instructions, context, nativeOptions }
) {
  const call = invokeScene(
    apiSetting,
    "segmentSubtitle",
    {
      items: events.map((event, index) => ({
        id: String(index),
        text: event.text,
        start: event.start,
        end: event.end,
      })),
      sourceLanguage: from,
      targetLanguage: to,
      instructions,
      context,
    },
    {
      signal,
      nativeOptions,
      streaming: "disabled",
      timeoutMs: (apiSetting.httpTimeout || 30) * 1000,
    }
  );
  try {
    return mapSubtitleGroups(await call.result, events);
  } finally {
    call.cancel();
  }
}
