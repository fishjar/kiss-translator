import {
  recognitionOptions,
  recognitionFeature,
  hasCompleteCoordinates,
} from "./recognition";

const i18n = (_key, fallback) => fallback;
const poly = [
  [0, 0],
  [20, 0],
  [20, 10],
  [0, 10],
];

test("dual capability services have distinct single selections and PDF displays VLM first", () => {
  const api = {
    apiSlug: "both",
    apiName: "Both",
    recognitionFeatures: {
      recognizeText: { coordinates: true },
      parseImage: { coordinates: false },
    },
  };
  const options = recognitionOptions([api], null, i18n, true);
  expect(
    options
      .filter((option) => option.groupLabel)
      .map((option) => option.groupLabel)
  ).toEqual(["VLM", "OCR"]);
  const choices = options.filter((option) => option.value);
  expect(choices.map((option) => JSON.parse(option.value))).toEqual([
    { apiSlug: "both", capability: "parseImage" },
    { apiSlug: "both", capability: "recognizeText" },
  ]);
  expect(choices[0].label).toContain("仅文本输出");
  expect(choices[1].label).toContain("带文字坐标");
  expect(
    recognitionFeature({ ...api, isDisabled: true }, "parseImage")
  ).toBeUndefined();
});

test("deleted selections remain visible instead of selecting another service", () => {
  const selection = { apiSlug: "gone", capability: "parseImage" };
  const options = recognitionOptions([], selection, i18n);
  expect(options[0].value).toBe("");
  expect(options[1]).toEqual({
    value: JSON.stringify(selection),
    label: "gone (当前不可用)",
  });
});

test("image synthesis requires real nondegenerate coordinates for every nonempty line", () => {
  expect(hasCompleteCoordinates([])).toBe(false);
  expect(hasCompleteCoordinates([{ text: "one", poly }])).toBe(true);
  expect(
    hasCompleteCoordinates([
      { text: "one", poly },
      { text: "two", poly: null },
    ])
  ).toBe(false);
  expect(
    hasCompleteCoordinates([
      {
        text: "one",
        poly: [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
      },
    ])
  ).toBe(false);
  expect(
    hasCompleteCoordinates([
      { text: "one", poly },
      { text: " ", poly: null },
    ])
  ).toBe(true);
});
