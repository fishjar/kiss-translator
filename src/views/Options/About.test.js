import { act } from "react";
import { createRoot } from "react-dom/client";
import About, { rehypeReadmeHtml } from "./About";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockUseI18nMd = jest.fn();
const mockReactMarkdown = jest.fn();

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
  useI18nMd: (...args) => {
    mockUseI18nMd(...args);
    return {
      data: "# Project details",
      loading: false,
      error: null,
    };
  },
}));

jest.mock("react-markdown", () => {
  const React = require("react");
  return (props) => {
    mockReactMarkdown(props);
    return React.createElement("div", null, props.children);
  };
});

describe("About", () => {
  test("loads project details only after expansion", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<About />));

    expect(mockUseI18nMd).not.toHaveBeenCalled();
    const summary = container.querySelector(".MuiAccordionSummary-root");
    act(() => {
      summary.click();
    });
    expect(mockUseI18nMd).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Project details");

    act(() => summary.click());
    act(() => summary.click());
    expect(mockUseI18nMd).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  test("passes the README HTML plugin to ReactMarkdown and drops leftover inline HTML", () => {
    mockReactMarkdown.mockClear();
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<About />));

    act(() => {
      container.querySelector(".MuiAccordionSummary-root").click();
    });
    expect(mockReactMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({
        skipHtml: true,
        rehypePlugins: [rehypeReadmeHtml],
      })
    );

    act(() => root.unmount());
  });

  test("renders README HTML blocks as sanitized elements", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "raw",
          value:
            '<table><tr><td align="center"><img src="https://example.com/logo.png" width="96" onerror="alert(1)"></td>' +
            '<td><a href="https://example.com/" target="_blank" onclick="alert(1)"><b>Sponsor</b></a></td></tr></table>' +
            '<!-- hidden note --><script>alert(1)</script><a href="javascript:alert(1)">x</a><form><input></form>',
        },
      ],
    };
    rehypeReadmeHtml()(tree);

    const find = (node, tag) =>
      node.tagName === tag
        ? node
        : (node.children || []).reduce((hit, c) => hit || find(c, tag), null);
    expect(tree.children[0]).toMatchObject({
      type: "element",
      tagName: "table",
    });
    expect(find(tree, "img").properties).toEqual({
      src: "https://example.com/logo.png",
      width: "96",
    });
    expect(find(tree, "a").properties).toEqual({
      href: "https://example.com/",
      target: "_blank",
      rel: ["noopener", "noreferrer"],
    });
    expect(find(tree, "b").children).toEqual([
      { type: "text", value: "Sponsor" },
    ]);
    expect(JSON.stringify(tree)).not.toMatch(
      /onerror|onclick|script|javascript:|form|input|hidden/
    );
  });
});
