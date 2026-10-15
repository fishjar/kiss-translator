import { isSameLang } from "./youtubeCaptionTracks.js";

describe("youtubeCaptionTracks", () => {
  test("matches caption tracks by normalized language family", () => {
    expect(isSameLang("zh-CN", "zh-TW")).toBe(true);
    expect(isSameLang("zh-Hans", "zh-CN")).toBe(true);
    expect(isSameLang("en-US", "en")).toBe(true);
    expect(isSameLang("qaa-US", "qaa-GB")).toBe(true);
    expect(isSameLang("en", "fr")).toBe(false);
  });

  test("keeps Chinese variants distinct when deciding whether to translate", () => {
    expect(isSameLang("zh-CN", "zh-TW", true)).toBe(false);
    expect(isSameLang("zh-Hans", "zh-CN", true)).toBe(true);
  });
});
