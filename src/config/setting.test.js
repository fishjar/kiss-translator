import {
  DEFAULT_INPUT_RULE,
  DEFAULT_MOUSE_HOVER_SETTING,
  DEFAULT_SUBTITLE_SETTING,
  DEFAULT_TRANBOX_SETTING,
} from "./setting";
import { OPT_TRANS_TENCENT } from "./api";
import { GLOBAL_KEY } from "./rules";

describe("translation box defaults", () => {
  test("uses Tencent for every default translation entry point", () => {
    expect(DEFAULT_INPUT_RULE.apiSlug).toBe(OPT_TRANS_TENCENT);
    expect(DEFAULT_TRANBOX_SETTING.apiSlugs).toEqual([OPT_TRANS_TENCENT]);
    expect(DEFAULT_SUBTITLE_SETTING.apiSlug).toBe(OPT_TRANS_TENCENT);
  });

  test("does not ignore any language by default", () => {
    expect(DEFAULT_TRANBOX_SETTING.skipLangs).toEqual([]);
  });

  test("follows the current page rule for hover bubbles by default", () => {
    expect(DEFAULT_MOUSE_HOVER_SETTING.apiSlug).toBe(GLOBAL_KEY);
  });
});
