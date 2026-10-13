// Shared appearance for the content FAB and its live settings preview.
export const FLOATING_BUTTON_STYLES = String.raw`
.kt-content-fab.MuiFab-root {
  width: var(--kt-fab-size, 56px);
  height: var(--kt-fab-size, 56px);
  min-width: var(--kt-fab-size, 56px);
  min-height: var(--kt-fab-size, 56px);
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--kt-fab-radius, 16px);
  background-color: var(--kt-pric);
  box-shadow: var(--kt-shadow-2);
  color: var(--kt-onpric);
  cursor: pointer;
  transition: background-color .2s ease, box-shadow .2s ease, transform .2s var(--kt-spring);
}
@media (hover: hover) {
  .kt-content-fab.MuiFab-root:hover {
    background-color: var(--kt-pric);
    background-color: color-mix(in srgb, var(--kt-onpric) 8%, var(--kt-pric));
  }
}
.kt-content-fab.MuiFab-root.Mui-focusVisible,
.kt-content-fab.MuiFab-root[aria-expanded="true"],
.kt-content-fab.MuiFab-root:active {
  background-color: var(--kt-pric);
  background-color: color-mix(in srgb, var(--kt-onpric) 10%, var(--kt-pric));
}
.kt-content-fab.MuiFab-root:active { transform: scale(.96); }
.kt-content-fab.MuiFab-root.Mui-focusVisible { outline: none; box-shadow: var(--kt-shadow-2), inset 0 0 0 3px var(--kt-pri); }
.kt-content-fab .MuiSpeedDialIcon-root { width: var(--kt-fab-icon-size, 24px); height: var(--kt-fab-icon-size, 24px); display: grid; place-items: center; }
.kt-content-fab .MuiSvgIcon-root { width: var(--kt-fab-icon-size, 24px); height: var(--kt-fab-icon-size, 24px); font-size: var(--kt-fab-icon-size, 24px); }
`;
