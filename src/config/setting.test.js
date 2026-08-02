import { DEFAULT_TRANBOX_SETTING } from "./setting";

describe("translation box defaults", () => {
  test("does not ignore any language by default", () => {
    expect(DEFAULT_TRANBOX_SETTING.skipLangs).toEqual([]);
  });
});
