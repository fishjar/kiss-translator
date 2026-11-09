import { FLOATING_BUTTON_STYLES } from "../../components/FloatingButton.styles";

/**
 * Material 3 styles for the content FAB and its action menu.
 * These rules depend on the CSS variables injected by M3Theme.
 */
export const ACTION_STYLES = String.raw`${FLOATING_BUTTON_STYLES}
.kt-content-fab-menu { width: max-content; min-width: 112px; max-width: min(280px, calc(100vw - 24px)); max-height: min(432px, calc(100vh - 24px)); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding: 8px 0; border: 1px solid var(--kt-linev); border-radius: 4px; background: var(--kt-sf0); }
.kt-content-fab-menu .MuiMenu-list { display: flex; flex-direction: column; gap: 4px; padding: 0; }
.kt-content-fab-menu__item { min-height: 48px; gap: 12px; padding: 0 16px; color: var(--kt-on); font-size: 12.5px; font-weight: 650; white-space: nowrap; transition: background .15s ease, transform .15s ease; }
@media (hover: hover) {
  .kt-content-fab-menu__item:hover { background: color-mix(in srgb, var(--kt-on) 8%, transparent); }
}
.kt-content-fab-menu__item:active { transform: scale(.97); }
.kt-content-fab-menu__item .MuiListItemIcon-root { min-width: 24px; color: var(--kt-pri); }
.kt-content-fab-menu__item svg { width: 19px; height: 19px; }
.kt-content-fab-menu .MuiMenuItem-root::before { content: none; }
.kt-content-fab-menu__item .MuiListItemText-root { min-width: 0; }
.kt-content-fab-menu__item .MuiListItemText-primary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* When the FAB reveals its close (X) icon, fill the hit area with the icon so
   the blank interaction region never mismatches the visible glyph. */
.kt-content-fab--x .MuiSpeedDialIcon-root { width: 100%; height: 100%; }
`;
