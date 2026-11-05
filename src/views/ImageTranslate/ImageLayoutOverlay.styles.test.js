import { readFileSync } from "fs";
import path from "path";

const source = readFileSync(
  path.resolve(__dirname, "ImageLayoutOverlay.js"),
  "utf8"
);

describe("image layout overlay disabled grey tokenization (v5 T4)", () => {
  test("business section carries no raw grey literals or rgba grey forms", () => {
    expect(source).not.toContain("#9e9e9e");
    expect(source).not.toContain("#757575");
    expect(source).not.toContain("rgba(158, 158, 158");
    expect(source).not.toContain("rgba(117, 117, 117");
  });

  test("disabled greys consume the MUI runtime palette grey[500] (PdfPage.js:29-33 单值口径)", () => {
    // 镜像 PdfPage.js:29-33：alpha(grey[500],0.15) 填充＋stroke＋badge 同用单值
    // grey[500]，badge 与 stroke 不分级；第 4 处为禁用态文字对该灰底取
    // getContrastText 前景（镜像 PdfPage.js:221-223）。计数钉死 4 处。
    expect((source.match(/theme\.palette\.grey\[500\]/g) || []).length).toBe(4);
  });

  test("badge background and stroke share grey[500]; disabled text foreground fits that grey (PdfPage.js:221-223 口径)", () => {
    // 徽章背景与描边共用单值 grey[500]，不分级。
    expect(source).toContain(
      "stroke={enabled ? accent.primary : theme.palette.grey[500]}"
    );
    expect(source).toContain(
      "fill={enabled ? accent.primary : theme.palette.grey[500]}"
    );
    // 禁用态序号文字不得硬编码白字：对该灰底取主题最优前景（容忍 JSX 换行格式）。
    expect(source).toMatch(
      /getContrastText\(\s*theme\.palette\.grey\[500\]\s*\)/
    );
    expect(source).not.toMatch(/fill="#ffffff"/);
  });
});
