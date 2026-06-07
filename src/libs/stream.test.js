jest.mock("@streamparser/json", () => ({
  JSONParser: jest.fn(),
}));

import { createSSEParser, getStreamDelta } from "./stream";
import { OPT_TRANS_EPHONEAI } from "../config";

describe("createSSEParser", () => {
  test("parses data fields with or without a following space", () => {
    const parse = createSSEParser();

    expect([...parse("data: hello\n\n")]).toEqual(["hello"]);
    expect([...parse("data:world\n\n")]).toEqual(["world"]);
  });

  test("keeps incomplete frames until the blank-line boundary arrives", () => {
    const parse = createSSEParser();

    expect([...parse("data: partial")]).toEqual([]);
    expect([...parse("\n\n")]).toEqual(["partial"]);
  });

  test("supports CRLF and multi-line data frames", () => {
    const parse = createSSEParser();

    expect([...parse("data: one\r\ndata: two\r\n\r\n")]).toEqual([
      "one\ntwo",
    ]);
  });

  test("filters DONE frames", () => {
    const parse = createSSEParser();

    expect([...parse("data: [DONE]\n\n")]).toEqual([]);
  });
});

describe("getStreamDelta", () => {
  test("extracts ePhoneAI as an OpenAI-compatible stream", () => {
    const chunk = {
      choices: [{ delta: { content: "hello" } }],
    };

    expect(getStreamDelta(chunk, OPT_TRANS_EPHONEAI)).toBe("hello");
  });
});
