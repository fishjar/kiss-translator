import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAPPING,
  BRAND_PATHS,
  FILLED,
  MUI_OVERRIDES,
  parseLucideSvg,
  renderBundleEntry,
  renderDispatcherHead,
  renderDispatcherHook,
  renderDispatcherEntry,
  resolveMuiName,
  kebabGroups,
  BRAND_LICENSE_LINES,
  LUCIDE_LICENSE_LINES,
  verifyLicenseConstant,
} from "./gen-lucide-icons.mjs";

// 上游图标集规模单一锚点：MAPPING 收录数变化时只改这一处。
const EXPECTED_MAPPING_COUNT = 205;

test("MAPPING has 205 keys with kebab-case values (GitHub moved to BRAND_PATHS)", () => {
  assert.equal(Object.keys(MAPPING).length, EXPECTED_MAPPING_COUNT);
  for (const [name, kebab] of Object.entries(MAPPING)) {
    assert.match(kebab, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${name}: ${kebab}`);
  }
});

test("FILLED is a subset of mapping keys", () => {
  for (const name of FILLED) assert.ok(MAPPING[name], name);
});

test("parseLucideSvg rejects unexpected viewBox and empty glyphs", () => {
  assert.throws(() =>
    parseLucideSvg('<svg viewBox="0 0 48 48"><path d="M0 0"/></svg>')
  );
  assert.throws(() => parseLucideSvg('<svg viewBox="0 0 24 24"></svg>'));
  const shapes = parseLucideSvg(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14"/><path d="M12 5v14"/></svg>'
  );
  assert.equal(shapes.length, 2);
  assert.equal(shapes[0].attrs.d, "M5 12h14");
  assert.equal(shapes[1].attrs.d, "M12 5v14");
});

test("parseLucideSvg rejects truncated input missing </svg>", () => {
  assert.throws(
    () => parseLucideSvg('<svg viewBox="0 0 24 24"><path d="M5 12h14"'),
    /missing <\/svg>/
  );
});

test("viewBox gate only honors the root <svg> tag, not decoy strings", () => {
  // 根元素 48×48、注释含 0 0 24 24 字样：全内容搜索形态会误放行。
  assert.throws(
    () =>
      parseLucideSvg(
        '<svg viewBox="0 0 48 48"><!-- expected viewBox="0 0 24 24" --><path d="M5 12h14"/></svg>'
      ),
    /unexpected root viewBox/
  );
  // 根元素 48×48、子元素属性恰好含目标字样：同样不得误放行。
  assert.throws(
    () =>
      parseLucideSvg(
        '<svg viewBox="0 0 48 48"><path d="M5 12h14" data-decoy="0 0 24 24"/></svg>'
      ),
    /unexpected root viewBox/
  );
  // 合法单引号 viewBox 必须被解析（而非靠字符串搜索碰中）。
  const singleQuoted = parseLucideSvg(
    "<svg viewBox='0 0 24 24'><path d='M5 12h14'/></svg>"
  );
  assert.equal(singleQuoted.length, 1);
  assert.equal(singleQuoted[0].attrs.d, "M5 12h14");
  // data-viewBox 与真实 viewBox 并存且坐标不同：校验必须取真实 viewBox。
  const withDataViewBox = parseLucideSvg(
    '<svg viewBox="0 0 24 24" data-viewBox="0 0 48 48"><path d="M5 12h14"/></svg>'
  );
  assert.equal(withDataViewBox.length, 1);
  // 仅 data-viewBox 命中 0 0 24 24、真实 viewBox 不同：无空白边界的匹配
  // 会先撞上 data-viewBox 误放行，校验必须失败。
  assert.throws(
    () =>
      parseLucideSvg(
        '<svg data-viewBox="0 0 24 24" viewBox="0 0 48 48"><path d="M5 12h14"/></svg>'
      ),
    /unexpected root viewBox/
  );
});

test("viewBox gate ignores decoys embedded inside earlier attribute values", () => {
  // 跨引号 decoy：更早属性的单引号值内嵌 前导空白+双引号 viewBox 伪形态，
  // 位置正则会先于真实属性命中并放行 48×48 根元素；属性名查表整值吞入后
  // 两引号风格均必须拒绝。
  assert.throws(
    () =>
      parseLucideSvg(
        '<svg data-a=\' viewBox="0 0 24 24"\' viewBox="0 0 48 48"><path d="M5 12h14"/></svg>'
      ),
    /unexpected root viewBox/
  );
  assert.throws(
    () =>
      parseLucideSvg(
        '<svg data-a=" viewBox=\'0 0 24 24\'" viewBox="0 0 48 48"><path d="M5 12h14"/></svg>'
      ),
    /unexpected root viewBox/
  );
});

test("attribute parsing accepts single quotes and rejects unparsed fragments", () => {
  // 单引号属性被静默丢弃会让生成缺 d 等必需属性：必须可解析。
  const shapes = parseLucideSvg(
    "<svg viewBox=\"0 0 24 24\"><path stroke-width='2' d='M5 12h14'/></svg>"
  );
  assert.equal(shapes[0].attrs.d, "M5 12h14");
  assert.equal(shapes[0].attrs.strokeWidth, "2");
  // 属性串残留未捕获片段（裸值等）必须失败，禁止静默产出残缺路径。
  assert.throws(
    () =>
      parseLucideSvg(
        '<svg viewBox="0 0 24 24"><path d="M5 12h14" broken /></svg>'
      ),
    /unparsed attribute fragment/
  );
});

test("parseLucideSvg rejects unsupported or non-self-closing elements", () => {
  // 未支持标签（ellipse）被旧实现静默丢弃
  assert.throws(
    () =>
      parseLucideSvg(
        '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10"/><path d="M5 12h14"/></svg>'
      ),
    /unsupported or non-self-closing/
  );
  // 非自闭合形状无法被自闭合正则捕获，同样不得静默通过
  assert.throws(
    () =>
      parseLucideSvg(
        '<svg viewBox="0 0 24 24"><path d="M5 12h14"></path></svg>'
      ),
    /unsupported or non-self-closing/
  );
});

test("parseLucideSvg rejects shapes missing required geometry attributes", () => {
  // 可解析但缺 d 的 path 会产出不可见图标：必须按形状标签校验必需几何属性。
  assert.throws(
    () => parseLucideSvg('<svg viewBox="0 0 24 24"><path fill="none"/></svg>'),
    /missing required attribute/
  );
  assert.throws(
    () =>
      parseLucideSvg('<svg viewBox="0 0 24 24"><circle cx="12" r="10"/></svg>'),
    /missing required attribute/
  );
  assert.throws(
    () =>
      parseLucideSvg(
        '<svg viewBox="0 0 24 24"><rect x="3" width="18" height="18"/></svg>'
      ),
    /missing required attribute/
  );
  assert.throws(
    () =>
      parseLucideSvg(
        '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19"/></svg>'
      ),
    /missing required attribute/
  );
  assert.throws(
    () =>
      parseLucideSvg('<svg viewBox="0 0 24 24"><polygon fill="none"/></svg>'),
    /missing required attribute/
  );
  // 各形状必需属性齐全时必须放行。
  assert.doesNotThrow(() =>
    parseLucideSvg('<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>')
  );
  assert.doesNotThrow(() =>
    parseLucideSvg(
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>'
    )
  );
  assert.doesNotThrow(() =>
    parseLucideSvg(
      '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>'
    )
  );
  assert.doesNotThrow(() =>
    parseLucideSvg(
      '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    )
  );
  assert.doesNotThrow(() =>
    parseLucideSvg(
      '<svg viewBox="0 0 24 24"><polyline points="3 6 9 6 9 12"/></svg>'
    )
  );
});

test("renderBundleEntry fills only the FILLED set", () => {
  assert.match(
    renderBundleEntry("Favorite", [{ tag: "path", attrs: { d: "M0 0" } }]),
    /fill: "currentColor"/
  );
  assert.match(
    renderBundleEntry("Close", [{ tag: "path", attrs: { d: "M0 0" } }]),
    /fill: "none"/
  );
});

test("renderDispatcherEntry delegates to the shared useIconComponent hook", () => {
  const entry = renderDispatcherEntry("Translate");
  assert.match(
    entry,
    /const Icon = useIconComponent\(MuiTranslate, LucideTranslateIcon\)/
  );
  assert.doesNotMatch(entry, /useSyncExternalStore/);
});

test("dispatcher head emits imports only, before per-icon imports", () => {
  const head = renderDispatcherHead();
  assert.match(
    head,
    /^import React, \{ useSyncExternalStore \} from "react";$/m
  );
  assert.match(
    head,
    /^import \{ getIconStyleSnapshot, subscribeIconStyle \} from "\.\.\/\.\.\/styles\/iconStyleStore";$/m
  );
  assert.doesNotMatch(head, /function useIconComponent/);
});

test("dispatcher hook block declares the shared useIconComponent hook", () => {
  const hook = renderDispatcherHook();
  assert.match(hook, /function useIconComponent\(MuiComp, LucideComp\) \{/);
  assert.match(
    hook,
    /const iconStyle = useSyncExternalStore\(subscribeIconStyle, getIconStyleSnapshot, getIconStyleSnapshot\);/
  );
  assert.match(hook, /return iconStyle === "mui" \? MuiComp : LucideComp;/);
});

test("kebabGroups mirrors the mapping's shared-glyph structure", () => {
  const groups = kebabGroups();
  const groupNames = groups.flatMap((group) => group);
  assert.equal(Object.keys(MAPPING).length, EXPECTED_MAPPING_COUNT);
  assert.deepEqual(
    [...groupNames].sort(),
    Object.keys(MAPPING).sort(),
    "group names must cover exactly the mapping keys"
  );
  assert.equal(groups.length, new Set(Object.values(MAPPING)).size);
  for (const group of groups) {
    const kebabs = new Set(group.map((n) => MAPPING[n]));
    assert.equal(kebabs.size, 1, `group drifted: ${group.join(",")}`);
  }
});

test("MUI_OVERRIDES redirects MyLocation pair to CenterFocus", () => {
  assert.ok(MUI_OVERRIDES, "MUI_OVERRIDES should be exported");
  assert.equal(MUI_OVERRIDES.MyLocation, "CenterFocusStrong");
  assert.equal(MUI_OVERRIDES.MyLocationOutlined, "CenterFocusWeak");
  // Only the MyLocation pair is overridden; all other icons fall through to 1:1.
  assert.equal(Object.keys(MUI_OVERRIDES).length, 2);
});

test("resolveMuiName applies overrides with 1:1 fallback", () => {
  // 行为级断言：override 命中改道、未命中透传。生成器两个消费点
  // （GLYPH_META.mui 与 dispatcher 的 MUI 导入）都经此单点，不再用
  // 源码正则匹配实现文本（格式化即可击穿的脆弱断言）。
  assert.equal(resolveMuiName("MyLocation"), "CenterFocusStrong");
  assert.equal(resolveMuiName("MyLocationOutlined"), "CenterFocusWeak");
  assert.equal(resolveMuiName("Close"), "Close");
  assert.equal(Object.keys(MUI_OVERRIDES).length, 2);
});

test("GitHub registers via the brand path channel, not the external-link mapping", () => {
  // lucide 1.61 上游无品牌图标：GitHubIcon 不再由 MAPPING 派生 external-link，
  // 改走 BRAND_PATHS 手补品牌描边通道（路径数据逐字来自 lucide 历史 github 描边）。
  assert.ok(
    BRAND_PATHS && BRAND_PATHS.GitHub,
    "GitHub must be registered in BRAND_PATHS"
  );
  assert.equal(BRAND_PATHS.GitHub.kebab, "github");
  const paths = BRAND_PATHS.GitHub.paths;
  assert.ok(Array.isArray(paths) && paths.length === 2);
  assert.equal(
    paths[0].d,
    "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"
  );
  assert.equal(paths[1].d, "M9 18c-4.51 2-5-2-7-2");
  assert.ok(!("GitHub" in MAPPING), "GitHub must not stay in MAPPING");
});

test("Telegram keeps the send mapping (no brand glyph upstream)", () => {
  assert.equal(MAPPING.Telegram, "send");
});

test("LUCIDE_LICENSE_LINES carries the full ISC and Feather MIT declarations", () => {
  const text = LUCIDE_LICENSE_LINES.join("\n");
  // 关键字段与 node_modules/lucide-static/LICENSE 原文逐字一致：
  // ISC 年份署名、MIT 年份署名、MIT/ISC 全文段落与派生清单标题。
  assert.ok(text.includes("ISC License"));
  assert.ok(text.includes("Copyright (c) 2026 Lucide Icons and Contributors"));
  assert.ok(
    text.includes(
      "The following Lucide icons are derived from the Feather project:"
    )
  );
  assert.ok(
    text.includes("The MIT License (MIT) (for the icons listed above)")
  );
  assert.ok(text.includes("Copyright (c) 2013-present Cole Bemis"));
  assert.ok(text.includes("copies or substantial portions of the Software."));
  assert.ok(
    text.includes(
      "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE"
    )
  );
});

test("verifyLicenseConstant passes on exact upstream text and rejects drift", () => {
  // 可注入口径：经临时夹具模拟上游 LICENSE，不真读 node_modules。
  const dir = mkdtempSync(path.join(tmpdir(), "license-fixture-"));
  const licensePath = path.join(dir, "LICENSE");
  writeFileSync(licensePath, `${LUCIDE_LICENSE_LINES.join("\n")}\n`, "utf8");
  assert.doesNotThrow(() => verifyLicenseConstant(licensePath));
  // 漂移形态：改写 ISC 署名行，校验必须拒绝并报出首个差异行。
  writeFileSync(
    licensePath,
    LUCIDE_LICENSE_LINES.join("\n").replace(
      "Copyright (c) 2026 Lucide Icons and Contributors",
      "Copyright (c) 2020 Lucide Icons and Contributors"
    ),
    "utf8"
  );
  assert.throws(
    () => verifyLicenseConstant(licensePath),
    /Copyright \(c\) 2020 Lucide Icons and Contributors/
  );
});

test("license text ships in public/ so the build archive keeps the declarations", () => {
  // 生产构建剥除生成物 JS 头部注释（Terser comments:false）；独立文本文件
  // 随 public/ 原样拷贝进发布归档，保证 ISC 与 Feather MIT 声明可达。
  const licensePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "public",
    "icons-license.txt"
  );
  assert.ok(existsSync(licensePath), "public/icons-license.txt must exist");
  const shipped = readFileSync(licensePath, "utf8");
  assert.equal(
    shipped,
    `${[...LUCIDE_LICENSE_LINES, ...BRAND_LICENSE_LINES].join("\n").trimEnd()}\n`
  );
});

test("public license text carries the GitHub brand MIT attribution", () => {
  // GitHub 品牌描边不经 lucide-static 派生（BRAND_PATHS 手补），其 Feather
  // MIT 溯源若只存在于普通 // 行注释，userscript 通道 Terser 会剥除——
  // 归属必须进入分发面文本文件本体。
  const licensePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "public",
    "icons-license.txt"
  );
  const shipped = readFileSync(licensePath, "utf8");
  assert.ok(shipped.includes("GitHub brand glyph"));
  assert.ok(shipped.includes("MIT License"));
  assert.ok(shipped.includes("Copyright (c) 2013-present Cole Bemis"));
});

test("generated lucide bundle carries the brand attribution inside the /*! block", () => {
  // 与 public 文件同源：/*! 法律注释块是 userscript 分发件的唯一许可载体
  // （普通 // 行被剥除），品牌归属必须位于块内。
  const bundlePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "src",
    "components",
    "icons",
    "lucide",
    "index.js"
  );
  const bundle = readFileSync(bundlePath, "utf8");
  const legalBlock = bundle.match(/\/\*![\s\S]*?\*\//)?.[0];
  assert.ok(legalBlock, "a /*! legal comment block must be present");
  assert.ok(
    legalBlock.includes("GitHub brand glyph"),
    "GitHub brand MIT attribution must live inside the /*! block"
  );
});

test("generated lucide bundle carries the license as a /*! legal comment", () => {
  // userscript 通道的 Terser 仅保留 /*! 注释、剥除普通 // 行（且无独立
  // license 文件兜底）；许可块若以行注释落地，.user.js 分发件将失去
  // Lucide ISC / Feather MIT 声明。
  const bundlePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "src",
    "components",
    "icons",
    "lucide",
    "index.js"
  );
  assert.ok(existsSync(bundlePath), "lucide bundle must exist");
  const bundle = readFileSync(bundlePath, "utf8");
  assert.ok(bundle.includes("/*!\n"), "license must open a /*! legal comment");
  // 署名必须位于 /*! 块内部：全文件 includes 无法区分"块内声明"与
  // "被剥除区散落提及"，只有块内形态能在 userscript 压缩后存活。
  const legalBlock = bundle.match(/\/\*![\s\S]*?\*\//)?.[0];
  assert.ok(legalBlock, "a /*! legal comment block must be present");
  assert.ok(
    legalBlock.includes("Copyright (c) 2026 Lucide Icons and Contributors"),
    "ISC attribution must live inside the /*! block"
  );
  assert.ok(
    legalBlock.includes("Copyright (c) 2013-present Cole Bemis"),
    "Feather MIT attribution must live inside the /*! block"
  );
  assert.ok(
    legalBlock.includes(
      "The following Lucide icons are derived from the Feather project:"
    ),
    "Feather derived-icons roster must live inside the /*! block"
  );
});
