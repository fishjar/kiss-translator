export const TRANSLATION_PANEL_STYLES = String.raw`
.kt-translation-panel { overflow: visible; border: 1px solid var(--kt-linev); border-radius: 16px !important; background: var(--kt-sf0) !important; color: var(--kt-on); box-shadow: var(--kt-shadow-2); }
.kt-translation-panel__body { min-width: 0; border-radius: 0 0 16px 16px; background: var(--kt-sf0); overflow-x: hidden; word-break: break-word; scrollbar-width: thin; scrollbar-color: var(--kt-onv) var(--kt-sf0); }
.kt-translation-panel__body::-webkit-scrollbar { width: 10px; height: 10px; }
.kt-translation-panel__body::-webkit-scrollbar-track { background: var(--kt-sf0); }
.kt-translation-panel__body::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--kt-on) 24%, transparent); border-radius: 999px; border: 2px solid var(--kt-sf0); }
.kt-translation-panel__body::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--kt-on) 36%, transparent); }
.kt-translation-panel--embedded { border: 0; border-radius: 0 !important; box-shadow: none; }
.kt-translation-panel--embedded .kt-translation-panel__body { border-radius: 0; }
.kt-tranbox-header { min-height: 56px; display: flex; align-items: center; gap: 6px; position: relative; padding: 7px 8px 7px 10px; border-bottom: 1px solid var(--kt-linev); border-radius: 16px 16px 0 0; background: var(--kt-sf0); color: var(--kt-on); }
.kt-tranbox-header__drag { display: flex; color: var(--kt-onv); cursor: move; }
.kt-tranbox-header__drag svg { width: 19px; height: 19px; }
.kt-tranbox-header__brand { min-width: 0; flex: 1; display: flex; align-items: center; gap: 7px; overflow: hidden; }
.kt-tranbox-header__logo { width: 22px; height: 22px; flex: none; display: grid; place-items: center; border-radius: 7px; background: var(--kt-sf1); }
.kt-tranbox-header__title { min-width: 0; overflow: hidden; color: var(--kt-onv); font-size: 11.5px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.kt-tranbox-header__actions { display: flex; flex: none; align-items: center; gap: 1px; }
.kt-tranbox-header .MuiIconButton-root { width: 34px; height: 34px; }
.kt-tranbox-header .MuiIconButton-root svg { width: 18px; height: 18px; }
.kt-tranbox-header .MuiIconButton-root[aria-pressed="true"] { background: var(--kt-pric); color: var(--kt-onpric); }
@media (hover: hover) {
  .kt-tranbox-header .MuiIconButton-root[aria-pressed="true"]:hover { background: color-mix(in srgb, var(--kt-onpric) 8%, var(--kt-pric)); }
}
.kt-tranbox-header .MuiIconButton-root[aria-pressed="true"].Mui-focusVisible,
.kt-tranbox-header .MuiIconButton-root[aria-pressed="true"]:active { background: color-mix(in srgb, var(--kt-onpric) 10%, var(--kt-pric)); }
.kt-tranbox-header__menu { box-sizing: border-box; min-width: min(206px, calc(100vw - 16px)); max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); display: flex; flex-direction: column; position: absolute; top: 48px; right: 42px; z-index: 4; overflow-x: hidden; overflow-y: auto; padding: 6px; border: 1px solid var(--kt-linev); border-radius: 4px; background: var(--kt-sf0); box-shadow: var(--kt-shadow-2); }
.kt-tranbox-header__menu button { min-height: 39px; flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 0 11px; border: 0; border-radius: 8px; background: transparent; color: var(--kt-on); cursor: pointer; font: inherit; font-size: 11.5px; text-align: left; }
.kt-tranbox-header__menu button[aria-checked="true"] { background: var(--kt-pric); color: var(--kt-onpric); }
.kt-tranbox-header__menu button:disabled { opacity: .5; cursor: default; }
@media (hover: hover) {
  .kt-tranbox-header__menu button:hover { background: var(--kt-pric); color: var(--kt-onpric); }
}
.kt-tranbox-header__menu svg { width: 18px; height: 18px; flex: none; }

.kt-tranbox-content { container-type: inline-size; container-name: kt-translation-content; padding: 14px !important; background: var(--kt-sf0) !important; color: var(--kt-on) !important; }
.kt-translation-panel__body .MuiGrid-container { width: 100%; margin: 0; padding: 5px; border-radius: 12px; background: var(--kt-sf1); }
.kt-translation-panel__body .MuiGrid-item { padding: 5px !important; }
@container kt-translation-content (width < 420px) {
  .kt-translation-config > .kt-translation-config__service { flex-basis: 100%; max-width: 100%; }
  .kt-translation-config > .kt-translation-config__language { flex-basis: 50%; max-width: 50%; }
}
.kt-translation-panel__body .MuiFilledInput-root { border-radius: 12px; }
.kt-translation-panel__body .MuiInputLabel-root { font-size: 12px; }
.kt-translation-panel__body .MuiInputBase-input { font-size: 12.5px; }
.kt-translation-panel__body .MuiTabs-root { min-height: 40px; }
.kt-translation-panel__body .MuiTab-root { min-height: 32px; padding: 5px 13px; font-size: 11.5px; }
.kt-translation-panel__body .MuiFormHelperText-root { margin-inline: 8px; }
.kt-translation-panel__body .MuiAlert-root { border-radius: 12px; }
.kt-translation-panel__body .MuiCircularProgress-root { color: var(--kt-pri); }

`;
