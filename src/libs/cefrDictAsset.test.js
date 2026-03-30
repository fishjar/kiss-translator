const fs = require("fs");
const path = require("path");

const DICT_PATH = path.resolve(
  __dirname,
  "../../public/assets/cefr_dict.json"
);

describe("bundled CEFR dictionary asset", () => {
  test("includes at least 30k words with CEFR levels and Chinese glosses", () => {
    const dict = JSON.parse(fs.readFileSync(DICT_PATH, "utf8"));
    const entries = Object.entries(dict);

    expect(entries.length).toBeGreaterThanOrEqual(30000);

    entries.slice(0, 200).forEach(([word, entry]) => {
      expect(word).toMatch(/^[a-z]+$/);
      expect(entry).toEqual(
        expect.objectContaining({
          level: expect.stringMatching(/^(A1|A2|B1|B2|C1|C2)$/),
          zh: expect.any(String),
        })
      );
      expect(entry.zh.trim()).not.toBe("");
    });
  });
});
