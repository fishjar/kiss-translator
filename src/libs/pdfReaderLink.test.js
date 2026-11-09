import {
  buildNativePdfUrl,
  buildPdfReaderUrl,
  parsePdfReaderFile,
  shouldOpenPdfReader,
} from "./pdfReaderLink";

const READER = "chrome-extension://abc/pdf-reader.html";
const ARXIV = "https://arxiv.org/pdf/2601.01674";

describe("pdf reader links", () => {
  const originalClient = process.env.REACT_APP_CLIENT;

  afterEach(() => {
    process.env.REACT_APP_CLIENT = originalClient;
  });

  test("takes over extension-less arXiv PDFs on the Chrome client", () => {
    process.env.REACT_APP_CLIENT = "chrome";
    expect(shouldOpenPdfReader(ARXIV)).toBe(true);
    expect(shouldOpenPdfReader("http://example.com/a.pdf?x=1")).toBe(true);
  });

  test.each(["firefox", "thunderbird", "safari", "userscript", "web"])(
    "leaves %s untouched because it has no bundled reader page",
    (client) => {
      process.env.REACT_APP_CLIENT = client;
      expect(shouldOpenPdfReader(ARXIV)).toBe(false);
    }
  );

  test.each([
    "file:///Users/me/a.pdf",
    "chrome-extension://abc/a.pdf",
    "not a url",
    "",
  ])("does not take over %s", (href) => {
    process.env.REACT_APP_CLIENT = "chrome";
    expect(shouldOpenPdfReader(href)).toBe(false);
  });

  test("respects the native-viewer escape hatch", () => {
    process.env.REACT_APP_CLIENT = "chrome";
    expect(shouldOpenPdfReader(buildNativePdfUrl(ARXIV))).toBe(false);
  });

  test("round-trips the source URL and keeps its page fragment for the viewer", () => {
    const source = "https://example.com/paper.pdf?token=a&b=c%20d#page=3";
    const reader = new URL(buildPdfReaderUrl(READER, source));

    expect(reader.href.split(/[?#]/)[0]).toBe(READER);
    expect(reader.hash).toBe("#page=3");
    expect(parsePdfReaderFile(reader.search)).toBe(
      "https://example.com/paper.pdf?token=a&b=c%20d"
    );
  });

  test.each([
    "",
    "?file=",
    "?file=javascript:alert(1)",
    "?file=file:///etc/passwd",
    "?file=chrome-extension://abc/x.pdf",
  ])("rejects reader input %s", (search) => {
    expect(parsePdfReaderFile(search)).toBeNull();
  });

  test("the native URL replaces any fragment with the escape mark", () => {
    expect(buildNativePdfUrl(`${ARXIV}#page=2`)).toBe(`${ARXIV}#kiss-native`);
  });
});
