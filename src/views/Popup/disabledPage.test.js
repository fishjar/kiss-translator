import { loadDisabledPopupData } from "./disabledPage";
import {
  getDisabledSubRules,
  getRulesWithDefault,
  getSettingWithDefault,
  getSubRules,
} from "../../libs/storage";
import { loadOrFetchSubRules } from "../../libs/subRules";

jest.mock("../../libs/storage", () => ({
  getSettingWithDefault: jest.fn(),
  getRulesWithDefault: jest.fn(),
  getSubRules: jest.fn(),
  getDisabledSubRules: jest.fn(),
  saveEdit: jest.fn(),
}));
jest.mock("../../libs/subRules", () => ({ loadOrFetchSubRules: jest.fn() }));
jest.mock("../../libs/sync", () => ({ trySyncRules: jest.fn() }));
jest.mock("../../libs/log", () => ({
  ...jest.requireActual("../../libs/log"),
  kissLog: jest.fn(),
}));

const tab = { id: 7, url: "https://example.com/article", status: "complete" };
const setting = {
  blacklist: "example.com",
  injectRules: true,
  subrulesList: [
    { url: "https://rules.example.com/rules.json", selected: true },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  getSettingWithDefault.mockResolvedValue(setting);
  getRulesWithDefault.mockResolvedValue([
    { pattern: "*", toLang: "en", fromLang: "auto" },
    { pattern: "example.com", toLang: "ja" },
  ]);
  getSubRules.mockResolvedValue([
    { pattern: "example.com", apiSlug: "google" },
  ]);
  getDisabledSubRules.mockResolvedValue([]);
});

test("derives the actual personal, cached subscription, and global rule precedence", async () => {
  const snapshot = await loadDisabledPopupData(tab);
  expect(snapshot.rule).toEqual(
    expect.objectContaining({
      toLang: "ja",
      fromLang: "auto",
      apiSlug: "google",
    })
  );
  expect(snapshot.isDisabledPage).toBe(true);
  expect(snapshot.document).toBeUndefined();
  expect(snapshot.capabilities).toEqual({
    pageTranslation: false,
    ruleEditor: false,
    selectionTranslation: true,
    hoverTranslation: true,
    inputTranslation: true,
  });
  expect(loadOrFetchSubRules).not.toHaveBeenCalled();
});

test("honors disabled cached subscription rules without downloading replacements", async () => {
  getRulesWithDefault.mockResolvedValue([
    { pattern: "*", apiSlug: "microsoft" },
  ]);
  getDisabledSubRules.mockResolvedValue(["example.com"]);
  const snapshot = await loadDisabledPopupData(tab);
  expect(snapshot.rule.apiSlug).toBe("microsoft");
  expect(loadOrFetchSubRules).not.toHaveBeenCalled();
});

test("uses the first enabled API in a disabled-site snapshot without writing its rule", async () => {
  getSettingWithDefault.mockResolvedValue({
    ...setting,
    transApis: [
      { apiSlug: "google", isDisabled: true },
      { apiSlug: "later", sortOrder: 3 },
      { apiSlug: "first", sortOrder: -1 },
    ],
  });
  const snapshot = await loadDisabledPopupData(tab);
  expect(snapshot.rule.apiSlug).toBe("first");
  expect(loadOrFetchSubRules).not.toHaveBeenCalled();
});

test("uses local defaults when the selected subscription has no cache", async () => {
  getSubRules.mockResolvedValue(undefined);
  const snapshot = await loadDisabledPopupData(tab);
  expect(snapshot.rule.toLang).toBe("ja");
  expect(loadOrFetchSubRules).not.toHaveBeenCalled();
});

test("does not replace an ordinary unavailable page with a disabled snapshot", async () => {
  getSettingWithDefault.mockResolvedValue({
    ...setting,
    blacklist: "other.example.com",
  });
  expect(await loadDisabledPopupData(tab)).toBeUndefined();
  expect(getRulesWithDefault).not.toHaveBeenCalled();
});

test.each([
  "chrome://settings",
  "about:blank",
  "chrome-extension://extension/popup.html",
  "data:text/html,Example",
  "invalid url",
])("excludes restricted or invalid URLs: %s", async (url) => {
  expect(await loadDisabledPopupData({ ...tab, url })).toBeUndefined();
  expect(getSettingWithDefault).not.toHaveBeenCalled();
});

test("supports a blacklisted local file without adding a runtime identity", async () => {
  getSettingWithDefault.mockResolvedValue({
    blacklist: "file:///D:/Documents/*",
  });
  const snapshot = await loadDisabledPopupData({
    ...tab,
    url: "file:///D:/Documents/article.html",
  });
  expect(snapshot.isDisabledPage).toBe(true);
  expect(snapshot.document).toBeUndefined();
});

test("does not use an old URL while a new navigation is pending", async () => {
  expect(
    await loadDisabledPopupData({
      ...tab,
      pendingUrl: "https://other.example.com",
    })
  ).toBeUndefined();
  expect(getSettingWithDefault).not.toHaveBeenCalled();
});

test("fails closed when reading stored preferences rejects", async () => {
  getSettingWithDefault.mockRejectedValue(new Error("Storage is unavailable"));
  expect(await loadDisabledPopupData(tab)).toBeUndefined();
});
