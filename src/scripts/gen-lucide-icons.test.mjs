import { test } from "node:test";
import assert from "node:assert/strict";
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
  assert.throws(() => parseLucideSvg('<svg viewBox="0 0 48 48"><path d="M0 0"/></svg>'));
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

test("parseLucideSvg rejects unsupported or non-self-closing elements", () => {
  // 未支持标签（ellipse）被旧实现静默丢弃
  assert.throws(
    () => parseLucideSvg('<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10"/><path d="M5 12h14"/></svg>'),
    /unsupported or non-self-closing/
  );
  // 非自闭合形状无法被自闭合正则捕获，同样不得静默通过
  assert.throws(
    () => parseLucideSvg('<svg viewBox="0 0 24 24"><path d="M5 12h14"></path></svg>'),
    /unsupported or non-self-closing/
  );
});

test("renderBundleEntry fills only the FILLED set", () => {
  assert.match(renderBundleEntry("Favorite", [{ tag: "path", attrs: { d: "M0 0" } }]), /fill: "currentColor"/);
  assert.match(renderBundleEntry("Close", [{ tag: "path", attrs: { d: "M0 0" } }]), /fill: "none"/);
});

test("renderDispatcherEntry delegates to the shared useIconComponent hook", () => {
  const entry = renderDispatcherEntry("Translate");
  assert.match(entry, /const Icon = useIconComponent\(MuiTranslate, LucideTranslateIcon\)/);
  assert.doesNotMatch(entry, /useSyncExternalStore/);
});

test("dispatcher head emits imports only, before per-icon imports", () => {
  const head = renderDispatcherHead();
  assert.match(head, /^import React, \{ useSyncExternalStore \} from "react";$/m);
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
  assert.ok(BRAND_PATHS && BRAND_PATHS.GitHub, "GitHub must be registered in BRAND_PATHS");
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
