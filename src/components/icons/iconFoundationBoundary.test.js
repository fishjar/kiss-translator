import { readFileSync } from "fs";
import path from "path";

const read = (relative) =>
  readFileSync(path.resolve(__dirname, relative), "utf8");

describe("pure icon foundation boundary", () => {
  test("dispatcher imports only the icon-style store", () => {
    const dispatcher = read("index.js");
    expect(dispatcher).toContain('from "../../styles/iconStyleStore"');
    expect(dispatcher).not.toContain('from "../../styles/m3"');
  });

  test("icon-style store has no color or accessibility surface", () => {
    const store = read("../../styles/iconStyleStore.js");
    expect(store).not.toMatch(
      /icon[C]olor|ICON_COLO[R]_PRESETS|FOCUS_SILEN[T]_CSS|focusModalit[y]|scriptFocu[s]|--kt[-]/
    );
  });
});
