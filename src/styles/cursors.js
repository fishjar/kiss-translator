// 位图光标 9 键方向表：PANEL_BITMAP_CURSORS 供 Windows 上 Chromium 系
// 浏览器的 TranBox 面板手柄使用自绘 ARGB 位图光标，绕开硬件覆盖层合成
// 路径下把单色系统光标渲染成白色的缺陷；PANEL_KEYWORD_CURSORS 供其余
// 平台使用，值为裸回退关键字、与各站点现状关键字体系一致（零变化）。
// 内容由一次性生成流程（tmp/cursor-preview/gen-final-preview.js 定稿
// 渲染 + 本组装段）确定性产出，禁止手改 base64。平台判定函数
// resolvePanelCursors 与渲染期查表函数 panelCursor 由 Task 4 步骤 4.1
// 以 Replacement 追加（TDD：Task 3 判定四分支用例先跑出契约缺失类真
// 红，再落位）。
export const PANEL_BITMAP_CURSORS = {
  n: "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAZ0lEQVR42u2UMQ4AIAgD+f+ndXLQaEBDi0MvYSNyCMFMiHfaEvziA7bEVJwtse2cJXEqRpHwisAlIo/vJHIFAp21JTd9DIjc58PjhUF2IApsCasEykdwI4I9xRVf/5VA+QiEEEKk0wEChV6wu0BP9AAAAABJRU5ErkJggg==) 16 16, ns-resize",
  ne: "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAYklEQVR42u2UQQoAIAzD9v9P613QtWAEoYFdXdhmq0IIHzOMYgQUUIGuKAH1UUTAGS03AVGCXYEgwaxgPbJDk+sCa8NOghMQJdhfIEhgSehOgo/hF+nn5MGT5m4shxBC2DIBhXga9Cy2gbsAAAAASUVORK5CYII=) 16 16, ne-resize",
  e: "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAW0lEQVR42u2VQQoAIAgE9/+ftktevGTEpsgOdBACx4oNEEKIAdhesbYvzR1vGmv2xLEh2BKnicE+iYwAVSIrQJO4EUByz1yB0isofYT0QCoNohZR3OozEkKIZxZORF6w/5bMxAAAAABJRU5ErkJggg==) 16 16, ew-resize",
  se: "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAaklEQVR42u2VwQoAIAhD/f+ftktBBJUjl5c98NJlS5eZCSGEeMN71YgPFhP+VXwy4OOcbeIozjaAiHt2RtCbp3cDbTtlHMjMaXmIBo5nIJh2zgiAp8YdQdQsdSfc6utS2lHagerfUggRogGVYhr0veOdfgAAAABJRU5ErkJggg==) 16 16, nw-resize",
  s: "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAY0lEQVR42u2U0QoAIAgD/f+fXu8RltEmwQ58k7yaFGGMMeZDsCnu8B1siXaB1ghQLO3Ts6NoF2iPIIqHcnbg4HaYet/vQCKBRd/b/BMJHEpSJCTDUwnV8KWEerg08+rHZMwVAx4lXrDm86pnAAAAAElFTkSuQmCC) 16 16, ns-resize",
  sw: "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAZklEQVR42u2UywpAIQgF/f+f9m4qIrIHFweCMyC00iEfZkIIIf7hJdCC7V2hJPpi3gtQEmMxRMKHPuMSs6SoRJRwKUEIhBJEC3YSRgqk34PTxOgWoGc5GrLUwZt+7YpUgYsQQrzJB0eDGvSmslHaAAAAAElFTkSuQmCC) 16 16, ne-resize",
  w: "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAWUlEQVR42mNgGAWjYBSMgiEC/iNhdDH6WA4DOPh0tZwBlxi1HYPV5zgcQPUQwWc5zR1AyHLaO4CA5SPAAQMdBQOeCAdFNhwUBdGgKIoHRWU0CkbBKBgFNAUA0ldesFZqH7MAAAAASUVORK5CYII=) 16 16, ew-resize",
  nw: "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAZElEQVR42u2UMQoAIAwD+/9P6ypSNBUTHXLg2guNGmGM+ZxWOJwACPQAzzcACihB0AC0OpCh1LuwGzzLpQEyuayCVM6oIhu4lF8PMK1VKo/K2tny9FdUysdKJO+/ekeMMcYc0wE3mRr0Az2LQwAAAABJRU5ErkJggg==) 16 16, nw-resize",
  move: "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAVklEQVR42u2WSQoAIAgA/f+ni65lJLZZzIAXEZzKIhEA8JGMuT3NC1VDLYcAAsumvYmBgBb+lfbQBIy18zugrMxaB28dQdwhPHUNeQkRCCtw/UsG8BcZ608+0CPCY2kAAAAASUVORK5CYII=) 16 16, move",
};
export const PANEL_KEYWORD_CURSORS = {
  n: "ns-resize",
  ne: "ne-resize",
  e: "ew-resize",
  se: "nw-resize",
  s: "ns-resize",
  sw: "ne-resize",
  w: "ew-resize",
  nw: "nw-resize",
  move: "move",
};

// 平台判定：位图光标仅对 Windows 上的 Chromium 系浏览器启用（该缺陷面）。
// 主判据 userAgentData.platform === "Windows"（UA-CH 仅 Chromium 系存在，
// Windows 上的 Firefox 无此 API，自动落关键字表）；老 Chromium 无
// userAgentData 时回退 navigator.platform 以 "Win" 开头且 UA 含 "Chrome"
// （Edge 的 UA 同样含 Chrome，一并覆盖；Firefox UA 不含 Chrome，被排除）。
// macOS/Linux 一律关键字表，行为与改动前逐字一致。
export function resolvePanelCursors() {
  if (typeof navigator === "undefined") return PANEL_KEYWORD_CURSORS;
  const uad = navigator.userAgentData;
  if (uad) {
    return uad.platform === "Windows"
      ? PANEL_BITMAP_CURSORS
      : PANEL_KEYWORD_CURSORS;
  }
  const platform =
    typeof navigator.platform === "string" ? navigator.platform : "";
  const ua = typeof navigator.userAgent === "string" ? navigator.userAgent : "";
  if (platform.startsWith("Win") && ua.includes("Chrome")) {
    return PANEL_BITMAP_CURSORS;
  }
  return PANEL_KEYWORD_CURSORS;
}

// 渲染期查表：命中位图表返回位图串，否则返回裸回退关键字（与现状一致）。
export function panelCursor(direction) {
  return resolvePanelCursors()[direction] || direction;
}
