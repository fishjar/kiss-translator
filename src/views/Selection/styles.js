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

.KT-tranbtn { width: var(--kt-tranbtn-size, 32px); height: var(--kt-tranbtn-size, 32px); opacity: var(--kt-tranbtn-opacity, 1); display: grid; place-items: center; padding: 0; border: 0; border-radius: calc(var(--kt-tranbtn-size, 32px) * .16); appearance: none; background: transparent; box-shadow: none; color: var(--kt-onpric); cursor: pointer; font: inherit; transition: transform .15s, opacity 160ms ease; }
@media (hover: hover) {
  .KT-tranbtn:hover { opacity: 1; }
}
.KT-tranbtn:active { transform: scale(.94); }
.KT-tranbtn:focus { opacity: 1; outline: 2px solid var(--kt-pri); outline-offset: 2px; }
@supports selector(:focus-visible) {
  .KT-tranbtn:focus { outline: none; }
  .KT-tranbtn:focus-visible { outline: 2px solid var(--kt-pri); outline-offset: 2px; }
}
@media (prefers-reduced-motion: reduce) {
  .KT-tranbtn { transition: none; }
}
`;
