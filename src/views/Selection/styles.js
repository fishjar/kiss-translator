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
.KT-draggable-header { overflow: visible; }

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
