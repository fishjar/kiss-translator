import { FLOATING_BUTTON_STYLES } from "../../components/FloatingButton.styles";

/**
 * Material 3 styles for the content FAB and its action menu.
 * These rules depend on the CSS variables injected by M3Theme.
 */
export const ACTION_STYLES = String.raw`${FLOATING_BUTTON_STYLES}
.kt-content-fab-menu { min-width: 112px; width: max-content; max-width: min(280px, calc(100vw - 24px)); max-height: min(400px, calc(100vh - 24px)); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding: 8px; border: 1px solid var(--kt-linev); border-radius: 4px; background: var(--kt-sf0); }
.kt-content-fab-menu .MuiMenu-list { display: flex; flex-direction: column; gap: 4px; padding: 0; }
.kt-content-fab-menu .MuiMenu-list[hidden] { display: none; }
.kt-content-fab-menu__item { min-height: 48px; gap: 12px; padding: 0 16px; border-radius: 4px; color: var(--kt-on); font-size: 12.5px; font-weight: 650; line-height: 20px; white-space: nowrap; }
.kt-content-fab-menu__item .MuiListItemText-root { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-content-fab-menu__entry-summary { margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--kt-onv); font-weight: 500; }
.kt-content-fab-menu__item svg { width: 19px; height: 19px; flex-shrink: 0; }
.kt-content-fab-menu__option svg { width: 19px; height: 19px; flex-shrink: 0; }
.kt-content-fab-menu__option-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (hover: hover) {
  .kt-content-fab-menu__item:hover .kt-state-layer { opacity: .08; }
  .kt-content-fab-menu .kt-content-fab-menu__item:hover { background-color: transparent; }
}
.kt-content-fab-menu__item:active .kt-state-layer { opacity: .12; }
.kt-content-fab-menu__item .MuiListItemIcon-root { min-width: 24px; color: var(--kt-onv); }
.kt-state-layer { position: absolute; inset: 0; border-radius: inherit; background: currentColor; opacity: 0; pointer-events: none; transition: opacity .2s ease; z-index: 1; }
@media (hover: hover) {
  .kt-content-fab-menu__option:hover .kt-state-layer { opacity: .08; }
}
.kt-content-fab-menu__option:active .kt-state-layer { opacity: .12; }
.kt-content-fab-menu__gesture { display: flex; flex-direction: column; gap: 4px; }
.kt-content-fab-menu__gesture[hidden] { display: none; }
.kt-content-fab-menu__listbox { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; }
.kt-content-fab-menu__option { position: relative; display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 0 16px; border: none; border-radius: 4px; background: none; color: var(--kt-on); font-size: 12.5px; font-weight: 650; line-height: 20px; text-align: left; white-space: nowrap; cursor: pointer; }
.kt-content-fab-menu__option[aria-selected="true"] { background: var(--kt-secc); color: var(--kt-onsecc); font-weight: 600; }
.kt-content-fab-menu__option[aria-disabled="true"] { color: var(--kt-onv); cursor: default; pointer-events: none; }
.kt-content-fab-menu__back { position: relative; display: flex; align-items: center; width: 100%; border: none; background: none; color: var(--kt-on); font-size: 12.5px; font-weight: 650; text-align: left; cursor: pointer; }
.kt-content-fab-menu__back svg { width: 19px; height: 19px; flex-shrink: 0; }
.kt-content-fab-menu__item:focus-visible, .kt-content-fab-menu__option:focus-visible, .kt-content-fab-menu__back:focus-visible { outline: 2px solid var(--kt-pri); outline-offset: 2px; }
@media (forced-colors: active) {
  .kt-content-fab-menu__item:focus-visible, .kt-content-fab-menu__option:focus-visible, .kt-content-fab-menu__back:focus-visible { outline: 2px solid CanvasText; }
  .kt-content-fab-menu__option[aria-selected="true"] { border: 2px solid Highlight; }
}
@media (pointer: coarse) {
  .kt-content-fab-menu__back { min-height: 48px; }
}
`;
