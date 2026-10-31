import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  MAPPING,
  FILLED,
  MUI_OVERRIDES,
  parseLucideSvg,
  renderBundleEntry,
  renderDispatcherHead,
  renderDispatcherHook,
  renderDispatcherEntry,
  kebabGroups,
} from "./gen-lucide-icons.mjs";

test("MAPPING has 191 keys with kebab-case values", () => {
  assert.equal(Object.keys(MAPPING).length, 191);
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
    /^import \{ getIconStyleSnapshot, subscribeIconStyle \} from "\.\.\/\.\.\/styles\/m3";$/m
  );
  assert.doesNotMatch(head, /function useIconComponent/);
});

test("dispatcher hook block declares the shared useIconComponent hook", () => {
  const hook = renderDispatcherHook();
  assert.match(hook, /function useIconComponent\(MuiComp, LucideComp\) \{/);
  assert.match(
    hook,
    /const iconStyle = useSyncExternalStore\(subscribeIconStyle, getIconStyleSnapshot\);/
  );
  assert.match(hook, /return iconStyle === "mui" \? MuiComp : LucideComp;/);
});

test("kebabGroups mirrors the mapping's shared-glyph structure", () => {
  const groups = kebabGroups();
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

test("generator source uses MUI_OVERRIDES with default fallback", () => {
  const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "gen-lucide-icons.mjs");
  const source = readFileSync(scriptPath, "utf8");
  assert.match(source, /MUI_OVERRIDES\[name\]\s*\?\?\s*name/, "emit must use MUI_OVERRIDES[name] ?? name fallback");
});
