import { apiTranslate } from "../../apis";
import { isSameTranslationLanguage } from "../../libs/language";
import { kissLog } from "../../libs/log";

const dictionaryMarker = (index) => `{{KTD${index}}}`;

const serializeDictionaryValues = (values) =>
  values.map((value, index) => `${dictionaryMarker(index)}${value}`).join("\n");

const parseDictionaryValues = (text, expectedCount) => {
  const markers = [...text.matchAll(/\{\{KTD(\d+)\}\}/g)];
  const values = Array(expectedCount);
  const markerIndexes = markers.map((marker) => Number(marker[1]));

  if (
    markers.length !== expectedCount ||
    new Set(markerIndexes).size !== expectedCount ||
    markerIndexes.some(
      (index) => !Number.isInteger(index) || index < 0 || index >= expectedCount
    )
  ) {
    throw new Error("Dictionary translation did not preserve field markers");
  }

  markers.forEach((marker, markerIndex) => {
    const index = markerIndexes[markerIndex];
    const start = marker.index + marker[0].length;
    const end = markers[markerIndex + 1]?.index ?? text.length;
    values[index] = text.slice(start, end).trim();
  });
  return values;
};

/** Load dictionary or suggestion data and localize its Chinese definitions. */
export async function loadDictionary(
  { dict, text, toLang, apiSetting, translateVariants },
  { signal } = {}
) {
  const data = await dict.apiFn(text);
  if (
    !data ||
    !dict.localize ||
    !dict.getLocalizationValues ||
    !apiSetting ||
    !toLang ||
    isSameTranslationLanguage("zh-CN", toLang, translateVariants)
  ) {
    return data;
  }

  const values = [
    ...new Set(
      dict
        .getLocalizationValues(data)
        .filter((value) => typeof value === "string" && value.trim())
    ),
  ];
  if (values.length === 0) {
    return data;
  }

  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  try {
    // A component's abort signal must not cancel other tasks in a shared batch.
    const { trText } = await apiTranslate({
      text: serializeDictionaryValues(values),
      fromLang: "zh-CN",
      toLang,
      apiSetting,
      translateVariants,
      textFormat: "text",
    });
    const localizedValues = parseDictionaryValues(trText, values.length);
    const translations = new Map(
      values.map((value, index) => [value, localizedValues[index] || value])
    );

    return await dict.localize(
      data,
      (value) => translations.get(value) || value,
      { toLang }
    );
  } catch (error) {
    if (error?.name === "AbortError" && signal?.aborted) {
      throw error;
    }
    kissLog("dictionary localization failed", error);
    return data;
  }
}
