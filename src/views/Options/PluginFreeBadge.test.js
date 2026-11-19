import { renderToStaticMarkup } from "react-dom/server";
import PluginFreeBadge from "./PluginFreeBadge";
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => require("../../config/i18n").newI18n("zh"),
}));
test.each([
  ["free", "免费"],
  ["quota-limited", "限额免费"],
  ["some-models", "部分模型免费"],
  ["time-limited", "限时免费"],
])("%s displays the localized green badge", (freeTier, label) => {
  const html = renderToStaticMarkup(<PluginFreeBadge freeTier={freeTier} />);
  expect(html).toContain(`>${label}<`);
  expect(html).toContain("MuiChip-colorSuccess");
});
test("missing, invalid, and legacy-only values have no badge", () => {
  for (const value of [true, undefined, "constructor", "yes", 1]) {
    expect(renderToStaticMarkup(<PluginFreeBadge freeTier={value} />)).toBe("");
  }
  expect(renderToStaticMarkup(<PluginFreeBadge isFree={true} />)).toBe("");
});
