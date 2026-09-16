import { I18N } from "../config";
import { getI18n } from "./I18n";

jest.mock("./Setting", () => ({ useSetting: jest.fn() }));
jest.mock("./Fetch", () => ({ useGet: jest.fn() }));

test("uses the key as the default while preserving explicit fallbacks", () => {
  expect(getI18n("en", "nonexistent_key")).toBe("nonexistent_key");
  expect(getI18n("en", "nonexistent_key", "Fallback")).toBe("Fallback");
  expect(getI18n("en", "nonexistent_key", "")).toBe("");
  expect(getI18n("en", "app_name", "Fallback")).toBe(I18N.app_name.en);
});
