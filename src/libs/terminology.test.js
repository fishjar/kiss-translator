import {
  composeTerminology,
  compileTerminology,
  parseTableFile,
  exportTableFile,
  protectTerminologyText,
} from "./terminology";

const table = (id, terms = "", aiTerms = "", normalMatchMode = "auto") => ({
  id,
  name: id,
  description: "",
  terms,
  aiTerms,
  normalMatchMode,
});
const output = (text, resolved) => {
  const protectedText = protectTerminologyText(text, resolved.normalEntries);
  return protectedText.restore(protectedText.text);
};

test.each([
  "__KISS_TERM_0__",
  "__kiss_term_0__",
  "__KiSs_TeRm_ 0 __",
  "__KISS_TERM_\t0\t__",
])(
  "restores provider token variation %s without changing unknown IDs",
  (token) => {
    const protection = protectTerminologyText(
      "act component",
      composeTerminology([{ terms: "act,行动\ncomponent,组件" }]).normalEntries
    );
    expect(
      protection.restore(`${token} __kiss_term_1__ __KISS_TERM_99__`)
    ).toBe("行动 组件 __KISS_TERM_99__");
  }
);

test.each(["__kiss_term_0__", "__KiSs_TeRm_ 0 __", "__KISS_TERM_ 0 __"])(
  "avoids tolerant token collisions with original source %s",
  (original) => {
    const protection = protectTerminologyText(
      `${original} act`,
      composeTerminology([{ terms: "act,行动" }]).normalEntries
    );
    const providerResult =
      original + protection.text.slice(original.length).toLowerCase();
    expect(protection.restore(providerResult)).toBe(`${original} 行动`);
  }
);

test("scene inline, scene tables, API inline, API tables preserve priority and empty values", () => {
  const resolved = composeTerminology(
    [
      {
        terms: "inline,scene\nKeep",
        aiTerms: "React,",
        termsList: ["scene", "second"],
      },
      {
        terms: "inline,api\nterm,api",
        aiTerms: "React,接口\nAPI,接口",
        termsList: ["api", "scene"],
      },
    ],
    [
      table("scene", "term,scene", "AI,场景"),
      table("second", "term,second"),
      table("api", "term,table"),
    ]
  );
  expect(output("inline term Keep", resolved)).toBe("scene scene Keep");
  expect(resolved.glossary).toEqual({ React: "", API: "接口", AI: "场景" });
});

test("global entries survive site overrides; unavailable IDs remain visible", () => {
  const resolved = composeTerminology([
    { terms: "component,部件", termsList: ["missing"] },
    { terms: "React\ncomponent,组件" },
  ]);
  expect(output("React component", resolved)).toBe("React 部件");
  expect(resolved.missingTableIds).toEqual(["missing"]);
});

test.each([
  ["act (act), react action act2 my_act", "X (X), react action act2 my_act"],
  ["éact acte acté act\u0301 act", "éact acte acté act\u0301 X"],
])("automatic boundaries: %s", (input, expected) => {
  expect(
    output(
      input,
      composeTerminology([{ termsList: ["a"] }], [table("a", "act,X")])
    )
  ).toBe(expected);
});

test("literal metacharacters, Chinese and emoji keep their literal meaning", () => {
  const resolved = composeTerminology(
    [{ termsList: ["a"] }],
    [table("a", "C++,CPP\n猫,喵\n😀,笑")]
  );
  expect(output("C++ 猫咪 😀", resolved)).toBe("CPP 喵咪 笑");
});

test("boundary rejection retries another branch at the same location", () => {
  const resolved = composeTerminology(
    [{ termsList: ["a", "b"] }],
    [table("a", "act,X"), table("b", "ac,Y", "", "substring")]
  );
  expect(output("action", resolved)).toBe("Ytion");
});

test("legacy regex alternatives retain consumption semantics", () => {
  expect(output("abcd", composeTerminology([{ terms: "ab,X;bcd|d,Y" }]))).toBe(
    "XcY"
  );
  expect(output("ab", composeTerminology([{ terms: "(?=a)a,X;ab,Y" }]))).toBe(
    "Xb"
  );
});

test("signatures depend on effective content and mode, not metadata", () => {
  const a = table("a", "act,X");
  const resolve = (t) =>
    composeTerminology([{ termsList: ["a"] }], [t]).signature;
  expect(resolve(a)).toBe(
    resolve({ ...a, name: "renamed", description: "changed" })
  );
  expect(resolve(a)).not.toBe(resolve({ ...a, normalMatchMode: "substring" }));
});

test("single table JSON round trip preserves both text blocks and identity", () => {
  const value = table("a", "React\nact,行动", "component,组件");
  expect(parseTableFile(exportTableFile(value))).toEqual(value);
  expect(() => parseTableFile('{"formatVersion":2}')).toThrow("version");
});

test("existing token-like source content survives restoration", () => {
  const text = "__KISS_TERM_0__ act";
  expect(output(text, composeTerminology([{ terms: "act,X" }]))).toBe(
    "__KISS_TERM_0__ X"
  );
});

test("restoration preserves underscores immediately before a protected term", () => {
  expect(output("__act", composeTerminology([{ terms: "act,X" }]))).toBe("__X");
});

test("automatic boundaries also protect technical words ending with digits", () => {
  const resolved = composeTerminology(
    [{ termsList: ["a"] }],
    [table("a", "act2,X")]
  );
  expect(output("act2 react2 act23", resolved)).toBe("X react2 act23");
});

test("task compilation reuses entries but source configuration changes invalidate it", () => {
  const snapshot = [table("a", "act,X")];
  const sources = [{ termsList: ["a"] }];
  const first = compileTerminology(sources, snapshot);
  expect(compileTerminology(sources, snapshot).normalEntries).toBe(
    first.normalEntries
  );
  sources[0].terms = "act,Y";
  expect(output("act", compileTerminology(sources, snapshot))).toBe("Y");
  expect(output("act", first)).toBe("X");
});

test("import preview may fill missing metadata, but rejects a missing table body", () => {
  const defaults = table("generated");
  expect(
    parseTableFile(
      JSON.stringify({ formatVersion: 1, table: { terms: "act,X" } }),
      defaults
    )
  ).toEqual({ ...defaults, terms: "act,X" });
  expect(() =>
    parseTableFile('{"formatVersion":1,"table":null}', defaults)
  ).toThrow("Invalid terminology table");
});

test("boundary rejection preserves capture slots for numeric regex backreferences", () => {
  const resolved = composeTerminology(
    [{ terms: "(a)\\2,Y", termsList: ["a"] }],
    [table("a", "aaaaaaaa,X")]
  );
  expect(output("aaaaaaaab", resolved)).toBe("YYYYYYYYb");
});
