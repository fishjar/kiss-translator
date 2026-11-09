import {
  isPdfTextLayerSelection,
  joinPdfSelectionLines,
} from "./selectionText";

describe("joinPdfSelectionLines", () => {
  test("joins real PDF.js text layer lines into one paragraph", () => {
    const raw =
      "Traditional Chinese Medicine (TCM), as an effective alternative medicine, has\n" +
      "been receiving increasing attention. In recent years, the rapid development of large\n" +
      "language models (LLMs) tailored for TCM has highlighted the urgent need for an\n" +
      "objective and comprehensive evaluation framework to assess their performance\n" +
      "on real-world tasks. However, existing evaluation datasets are limited in scope";

    expect(joinPdfSelectionLines(raw)).toBe(
      "Traditional Chinese Medicine (TCM), as an effective alternative medicine, has " +
        "been receiving increasing attention. In recent years, the rapid development of large " +
        "language models (LLMs) tailored for TCM has highlighted the urgent need for an " +
        "objective and comprehensive evaluation framework to assess their performance " +
        "on real-world tasks. However, existing evaluation datasets are limited in scope"
    );
  });

  test("repairs words broken by the line wrap", () => {
    expect(joinPdfSelectionLines("a consul-\ntation agent")).toBe(
      "a consultation agent"
    );
    expect(joinPdfSelectionLines("soft\u00ad-\nhyphen")).toBe("softhyphen");
    expect(joinPdfSelectionLines("evalua-\ntion")).toBe("evaluation");
    expect(joinPdfSelectionLines("in-\ndependent")).toBe("independent");
  });

  test.each([
    ["a self-\nevolving agent", "a self-evolving agent"],
    ["well-\nknown result", "well-known result"],
    ["cross-\nentropy loss", "cross-entropy loss"],
    ["an end-\nto-end model", "an end-to-end model"],
    ["COVID-\n19 cases", "COVID-19 cases"],
    ["Non-\nHodgkin", "Non-Hodgkin"],
    ["question-\nanswering (QA)", "question-answering (QA)"],
    ["rule-\nbased system", "rule-based system"],
  ])("keeps the hyphen of real compounds: %s", (raw, expected) => {
    expect(joinPdfSelectionLines(raw)).toBe(expected);
  });

  test("does not add spaces around punctuation or brackets from split spans", () => {
    expect(
      joinPdfSelectionLines(
        "syndrome differentiation (\nbianzheng\n), the step"
      )
    ).toBe("syndrome differentiation (bianzheng), the step");
  });

  test("joins CJK lines without inserting spaces", () => {
    expect(joinPdfSelectionLines("中医四诊的\n客观化研究")).toBe(
      "中医四诊的客观化研究"
    );
  });

  test("keeps real paragraph ends detected from short final lines", () => {
    const long = "x".repeat(70);
    expect(
      joinPdfSelectionLines(
        [
          `${long} first`,
          `${long} second`,
          "short end of paragraph.",
          `${long} third`,
          `${long} fourth`,
        ].join("\n")
      )
    ).toBe(
      `${long} first ${long} second short end of paragraph.\n${long} third ${long} fourth`
    );
  });

  test("does not treat a partially selected first line as a paragraph end", () => {
    const long = "x".repeat(70);
    expect(
      joinPdfSelectionLines(
        ["the direction.", `${long} a`, `${long} b`, `${long} c`].join("\n")
      )
    ).toBe(`the direction. ${long} a ${long} b ${long} c`);
  });

  test("keeps references and list items on their own lines", () => {
    expect(
      joinPdfSelectionLines(
        "[1] First reference\ncontinues here.\n[2] Second one."
      )
    ).toBe("[1] First reference continues here.\n[2] Second one.");
    expect(joinPdfSelectionLines("• one\n• two")).toBe("• one\n• two");
  });

  test("merges text across a page break", () => {
    expect(joinPdfSelectionLines("end of page\n\nstart of next")).toBe(
      "end of page start of next"
    );
  });

  test("handles empty and single-line input", () => {
    expect(joinPdfSelectionLines("")).toBe("");
    expect(joinPdfSelectionLines("  one line  ")).toBe("one line");
  });
});

describe("isPdfTextLayerSelection", () => {
  const selectionIn = (html, selector) => {
    const root = document.createElement("div");
    root.innerHTML = html;
    return { anchorNode: root.querySelector(selector).firstChild };
  };

  test("recognises text nodes inside a PDF.js text layer", () => {
    expect(
      isPdfTextLayerSelection(
        selectionIn('<div class="textLayer"><span>a</span></div>', "span")
      )
    ).toBe(true);
  });

  test("leaves ordinary page text alone", () => {
    expect(
      isPdfTextLayerSelection(selectionIn("<p><span>a</span></p>", "span"))
    ).toBe(false);
    expect(isPdfTextLayerSelection(null)).toBe(false);
    expect(isPdfTextLayerSelection({ anchorNode: null })).toBe(false);
  });
});
