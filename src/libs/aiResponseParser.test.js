import {
  normalizeTranslationItem,
  parseCompleteTranslationSegments,
  parseJsonTranslationSegments,
  parseLineTranslationSegments,
  parseXmlTranslationSegments,
} from "./aiResponseParser";

describe("aiResponseParser", () => {
  test("normalizes translation item field aliases", () => {
    expect(
      normalizeTranslationItem({
        id: "2",
        translation: "译文",
        src: "en",
      })
    ).toEqual({
      id: 2,
      translation: ["译文", "en"],
    });
  });

  test("parses JSON array responses", () => {
    expect(
      parseJsonTranslationSegments(
        '[{"id":0,"text":"你好","sourceLanguage":"en"}]'
      )
    ).toEqual([{ id: 0, translation: ["你好", "en"] }]);
  });

  test("parses JSON translations wrapper responses", () => {
    expect(
      parseJsonTranslationSegments(
        '{"translations":[{"id":1,"translation":"世界","src":"en"}]}'
      )
    ).toEqual([{ id: 1, translation: ["世界", "en"] }]);
  });

  test("parses single JSON object responses", () => {
    expect(
      parseJsonTranslationSegments(
        '{"id":0,"text":"单条译文","sourceLanguage":"en"}'
      )
    ).toEqual([{ id: 0, translation: ["单条译文", "en"] }]);
  });

  test("parses XML segments by id and keeps inner HTML", () => {
    expect(
      parseXmlTranslationSegments(
        '<root><t id="1" sourceLanguage="en">世界</t><t id="0" sourceLanguage="en">你好 <b>React</b></t></root>'
      )
    ).toEqual([
      { id: 0, translation: ["你好 <b>React</b>", "en"] },
      { id: 1, translation: ["世界", "en"] },
    ]);
  });

  test("parses LINE protocol and restores br line breaks", () => {
    expect(
      parseLineTranslationSegments("0 | 第一行<br>第二行\n1 | 世界")
    ).toEqual([
      { id: 0, translation: ["第一行\n第二行", ""] },
      { id: 1, translation: ["世界", ""] },
    ]);
  });

  test("skips incomplete LINE tail when requested", () => {
    expect(
      parseLineTranslationSegments("0 | 完整\n1 | 未完成", {
        requireCompleteLine: true,
      })
    ).toEqual([{ id: 0, translation: ["完整", ""] }]);
  });

  test("parses complete responses in JSON, XML, then LINE order", () => {
    expect(parseCompleteTranslationSegments("0 | 行协议")).toEqual([
      { id: 0, translation: ["行协议", ""] },
    ]);
    expect(
      parseCompleteTranslationSegments(
        '<root><t id="0" sourceLanguage="en">XML译文</t></root>'
      )
    ).toEqual([{ id: 0, translation: ["XML译文", "en"] }]);
  });
});
