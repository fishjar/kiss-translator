/**
 * @file styles.js
 * @description Material 3 styles for the selection translation panel.
 *
 * These rules require CSS variables from hooks/M3Theme, including --kt-sf0,
 * --kt-linev, and --kt-spring, plus the kt-m3-rise and kt-m3-pop keyframes
 * from src/styles/m3.js. Use them only inside M3Theme.
 *
 * DraggableResizable.js emits the KT-draggable* classes. Their overrides need
 * !important to take precedence over the nodes' MUI sx styles.
 */
export const SELECTION_STYLES = String.raw`
.KT-draggable { overflow: visible !important; border-radius: 16px !important; animation: kt-m3-rise .45s var(--kt-spring); }
.KT-draggable-body { overflow: visible !important; border: 1px solid var(--kt-linev) !important; border-radius: 16px !important; background: var(--kt-sf0) !important; box-shadow: var(--kt-shadow-2) !important; }
.KT-draggable-header { overflow: visible; border-radius: 16px 16px 0 0; background: var(--kt-sf0); }
.KT-draggable-container { overflow-x: hidden; border-radius: 0 0 16px 16px; background: var(--kt-sf0) !important; }

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
.kt-tranbox-header__menu { min-width: 206px; display: flex; flex-direction: column; position: absolute; top: 48px; right: 42px; z-index: 4; overflow: hidden; padding: 6px; border: 1px solid var(--kt-linev); border-radius: 4px; background: var(--kt-sf0); box-shadow: var(--kt-shadow-2); animation: kt-m3-rise .3s var(--kt-spring); }
.kt-tranbox-header__menu button { min-height: 39px; display: flex; align-items: center; gap: 10px; padding: 0 11px; border: 0; border-radius: 8px; background: transparent; color: var(--kt-on); cursor: pointer; font: inherit; font-size: 11.5px; text-align: left; }
.kt-tranbox-header__menu button[aria-checked="true"] { background: var(--kt-pric); color: var(--kt-onpric); }
@media (hover: hover) {
  .kt-tranbox-header__menu button:hover { background: var(--kt-pric); color: var(--kt-onpric); }
}
.kt-tranbox-header__menu svg { width: 18px; height: 18px; flex: none; }

.kt-tranbox-content { padding: 14px !important; background: var(--kt-sf0) !important; color: var(--kt-on) !important; }
.KT-draggable-container .MuiGrid-container { width: 100%; margin: 0; padding: 5px; border-radius: 12px; background: var(--kt-sf1); }
.KT-draggable-container .MuiGrid-item { padding: 5px !important; }
.KT-draggable-container .MuiFilledInput-root { border-radius: 12px; }
.KT-draggable-container .MuiInputLabel-root { font-size: 12px; }
.KT-draggable-container .MuiInputBase-input { font-size: 12.5px; }
.KT-draggable-container .MuiTabs-root { min-height: 40px; }
.KT-draggable-container .MuiTab-root { min-height: 32px; padding: 5px 13px; font-size: 11.5px; }
.KT-draggable-container .MuiFormHelperText-root { margin-inline: 8px; }
.KT-draggable-container .MuiAlert-root { border-radius: 12px; }
.KT-draggable-container .MuiCircularProgress-root { color: var(--kt-pri); }

.KT-tranbtn { width: 40px; height: 40px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 12px; appearance: none; background: var(--kt-pric); box-shadow: var(--kt-shadow-2); color: var(--kt-onpric); cursor: pointer; font: inherit; transition: background .2s, transform .15s; }
@media (hover: hover) {
  .KT-tranbtn:hover { background: color-mix(in srgb, var(--kt-onpric) 8%, var(--kt-pric)); }
}
.KT-tranbtn:active { background: color-mix(in srgb, var(--kt-onpric) 10%, var(--kt-pric)); transform: scale(.94); }
.KT-tranbtn:focus { outline: none; box-shadow: var(--kt-shadow-2), inset 0 0 0 3px var(--kt-pri); }
@supports selector(:focus-visible) {
  .KT-tranbtn:focus { box-shadow: var(--kt-shadow-2); }
  .KT-tranbtn:focus-visible { outline: none; box-shadow: var(--kt-shadow-2), inset 0 0 0 3px var(--kt-pri); }
}
.KT-tranbtn svg { width: 24px; height: 24px; fill: currentColor; }
`;
