import {
  DEFAULT_INPUT_RULE,
  DEFAULT_SUBTITLE_SETTING,
  DEFAULT_TRANBOX_SETTING,
} from "./setting";
import { OPT_TRANS_GOOGLE_2 } from "./api";

describe("translation box defaults", () => {
  test("uses Google2 for every default translation entry point", () => {
    expect(DEFAULT_INPUT_RULE.apiSlug).toBe(OPT_TRANS_GOOGLE_2);
    expect(DEFAULT_TRANBOX_SETTING.apiSlugs).toEqual([OPT_TRANS_GOOGLE_2]);
    expect(DEFAULT_SUBTITLE_SETTING.apiSlug).toBe(OPT_TRANS_GOOGLE_2);
  });

  test("does not ignore any language by default", () => {
    expect(DEFAULT_TRANBOX_SETTING.skipLangs).toEqual([]);
  });
});
