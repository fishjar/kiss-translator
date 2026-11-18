import { renderToStaticMarkup } from "react-dom/server";
import PluginFreeBadge from "./PluginFreeBadge";
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => require("../../config/i18n").newI18n("zh"),
}));
test("only an explicit free declaration displays a green badge", () => {
  const html = renderToStaticMarkup(<PluginFreeBadge isFree={true} />);
  expect(html).toContain("免费");
  expect(html).toContain("MuiChip-colorSuccess");
  for (const value of [false, undefined, "true", 1]) {
    expect(renderToStaticMarkup(<PluginFreeBadge isFree={value} />)).toBe("");
  }
});
