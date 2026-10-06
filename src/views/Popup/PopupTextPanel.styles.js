export const POPUP_TEXT_STYLES = String.raw`
.kt-popup-text-editor { position: relative; width: 100%; min-width: 0; padding: 0; }
/* This probe measures the page-derived baseline independently of appended results. */
.kt-popup-text-base-size { position: absolute; width: 0; height: var(--kt-popup-text-base-height); visibility: hidden; pointer-events: none; }
.kt-popup-text-card { display: flex; flex-direction: column; min-width: 0; min-height: var(--kt-popup-text-base-height); overflow: hidden; border: 1px solid var(--kt-linev); border-radius: 16px; background: var(--kt-sf0); }
.kt-popup-text-source { display: flex; flex: none; height: calc((var(--kt-popup-text-base-height) - 2px) * var(--kt-popup-text-source-fraction, .4)); flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; background: var(--kt-sf0); }
.kt-popup-text-target { display: flex; flex: none; flex-direction: column; min-width: 0; background: var(--kt-sf2); --kt-popup-text-result-height: max(0px, calc((var(--kt-popup-text-base-height) - 2px) * (1 - var(--kt-popup-text-source-fraction, .4)) - 49px)); }
.kt-popup-text-toolbar { display: flex; flex: none; align-items: center; min-width: 0; gap: 7px; height: 48px; padding: 8px 11px; }
.kt-popup-text-toolbar--target { padding-top: 9px; }
.kt-popup-text-language { display: inline-flex; align-items: center; gap: 4px; min-width: 0; height: 30px; padding: 0 1px; border: 0; border-radius: 7px; background: transparent; color: var(--kt-on); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.kt-popup-text-language:hover { background: var(--kt-sf3); }
.kt-popup-text-language__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-text-language > svg { width: 17px; height: 17px; flex: none; margin-left: 1px; color: var(--kt-onv); }
.kt-popup-text-auto { flex: none; border-radius: 999px; background: var(--kt-pric); color: var(--kt-onpric); padding: 2px 6px; font-size: 11px; font-weight: 700; line-height: 1.25; }
.kt-popup-text-source-actions { display: flex; align-items: center; flex: none; gap: 3px; margin-left: auto; }
.kt-popup-text-icon-button,
.kt-popup-text-source-actions .MuiIconButton-root,
.kt-popup-text-result__actions .MuiIconButton-root,
.kt-popup-text-result__actions > button { display: grid; flex: none; place-items: center; width: 28px; height: 28px; padding: 5px; border: 0; border-radius: 8px; background: transparent; color: var(--kt-onv); cursor: pointer; opacity: 1; }
.kt-popup-text-icon-button > svg,
.kt-popup-text-source-actions .MuiIconButton-root > svg,
.kt-popup-text-result__actions svg { width: 17px; height: 17px; font-size: 17px; }
.kt-popup-text-icon-button:hover,
.kt-popup-text-source-actions .MuiIconButton-root:hover,
.kt-popup-text-result__actions .MuiIconButton-root:hover,
.kt-popup-text-result__actions > button:hover { background: var(--kt-sf3); }
.kt-popup-text-icon-button:disabled,
.kt-popup-text-result__actions > button:disabled { cursor: default; opacity: .38; }
.kt-popup-text-source .kt-popup-text-input { display: block; flex: 1; width: 100%; min-width: 0; min-height: 0; margin: 0; padding: 5px 14px 14px; border: 0; border-radius: 0; outline: 0; resize: none; background: transparent; color: var(--kt-on); font: inherit; font-size: 15px; font-weight: 400; line-height: 1.55; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.kt-popup-text-source .kt-popup-text-input::placeholder { color: var(--kt-onv); }
.kt-popup-text-source .kt-popup-text-input:focus-visible { box-shadow: inset 2px 0 0 color-mix(in srgb, var(--kt-pri) 65%, transparent); }
.kt-popup-text-divider { position: relative; flex: none; height: 0; border-top: 1px solid var(--kt-linev); z-index: 2; }
.kt-popup-text-divider__grip { position: absolute; inset: -9px 0 auto; display: flex; justify-content: center; align-items: center; gap: 50px; height: 18px; cursor: row-resize; touch-action: none; }
.kt-popup-text-divider__grip > span { width: 26px; height: 3px; flex: none; border-radius: 999px; background: var(--kt-line); opacity: .45; }
.kt-popup-text-divider__grip:hover > span,
.kt-popup-text-divider__grip:focus-visible > span { background: var(--kt-pri); opacity: 1; }
.kt-popup-text-swap { position: absolute; top: -17px; left: 50%; display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 1px solid var(--kt-linev); border-radius: 50%; background: var(--kt-sf0); color: var(--kt-onv); transform: translateX(-50%); cursor: pointer; }
.kt-popup-text-swap > svg { width: 19px; height: 19px; }
.kt-popup-text-swap:hover { background: var(--kt-sf3); }
.kt-popup-text-swap:disabled { color: var(--kt-line); cursor: default; }
.kt-popup-text-services { display: inline-flex; align-items: center; flex: 0 1 auto; gap: 6px; min-width: 0; height: 32px; padding: 3px 5px 3px 7px; border: 0; border-radius: 10px; background: var(--kt-sf0); color: var(--kt-on); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.kt-popup-text-services:hover { background: var(--kt-sf3); }
.kt-popup-text-services:disabled { cursor: default; opacity: .5; }
.kt-popup-text-services:disabled:hover { background: var(--kt-sf0); }
.kt-popup-text-services[aria-expanded="true"] { box-shadow: 0 0 0 2px var(--kt-popup-focus, var(--kt-pri)); }
.kt-popup-text-services > svg { width: 17px; height: 17px; flex: none; }
.kt-popup-text-services__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-text-services__icons { display: flex; flex: none; align-items: center; }
.kt-popup-text-services__icons .kt-service-logo + .kt-service-logo { margin-left: -6px; }
.kt-popup-text-target-actions { display: flex; flex: none; align-items: center; margin-left: auto; }
.kt-popup-text-results { min-width: 0; min-height: var(--kt-popup-text-result-height); overflow: visible; }
/* Reserve the page baseline once for the list; individual results grow with content. */
.kt-popup-text-result { min-width: 0; min-height: min(80px, var(--kt-popup-text-result-height)); padding: 0; }
.kt-popup-text-result + .kt-popup-text-result { border-top: 1px solid var(--kt-linev); }
.kt-popup-text-result__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; min-height: 38px; padding: 6px 11px 3px 14px; }
.kt-popup-text-result__provider { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--kt-onv); font-size: 12px; font-weight: 700; }
.kt-popup-text-result__provider > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-text-result__actions { display: flex; align-items: center; flex: none; gap: 3px; }
.kt-popup-text-result__body { padding: 5px 14px 14px; }
.kt-popup-text-result__content { color: var(--kt-on); font-size: 15px; font-weight: 400; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.kt-popup-text-result__loading { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; color: var(--kt-onv); font-size: 11px; line-height: 1.5; }
.kt-popup-text-result__loading .MuiCircularProgress-root { color: var(--kt-pri); }
.kt-popup-text-result__empty,
.kt-popup-text-no-services { padding: 0; color: var(--kt-onv); font-size: 13px; line-height: 1.6; }
.kt-popup-text-no-services { padding: 5px 14px 14px; }
.kt-popup-text-result__error { color: var(--kt-err); font-size: 12.5px; line-height: 1.6; overflow-wrap: anywhere; }
.kt-popup-text-result__error p { margin: 0 0 7px; }
.kt-popup-text-result__retry { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 9px; border: 0; border-radius: 8px; background: var(--kt-sf0); color: var(--kt-pri); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.kt-popup-text-result__retry > svg { width: 16px; height: 16px; }
.kt-popup-text-result__retry:hover { background: var(--kt-sf3); }
.kt-popup-text-service-menu.MuiPaper-root { width: 236px; padding: 6px; }
.kt-popup-text-service-menu .kt-popup-menu-title { padding: 7px 9px; font-size: 11px; line-height: 1.5; }
.kt-popup-text-service-option.MuiMenuItem-root { display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 0 10px; color: var(--kt-on); font-size: 13px; font-weight: 600; }
.kt-popup-text-service-option > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-text-service-check { flex: none; width: 18px; height: 18px; color: var(--kt-line); }
.kt-popup-text-service-option[aria-checked="true"] .kt-popup-text-service-check { color: var(--kt-pri); }
.kt-popup-text-language:focus-visible,
.kt-popup-text-icon-button:focus-visible,
.kt-popup-text-swap:focus-visible,
.kt-popup-text-services:focus-visible,
.kt-popup-text-result__retry:focus-visible { outline: 2px solid var(--kt-pri); outline-offset: 2px; }
.kt-popup-text-divider__grip:focus-visible { outline: 2px solid var(--kt-pri); outline-offset: -2px; }
@media (max-width: 359px) {
  .kt-popup-text-toolbar { gap: 4px; padding-inline: 8px; }
  .kt-popup-text-language { font-size: 12px; }
  .kt-popup-text-services { gap: 4px; padding-inline: 5px; }
  .kt-popup-text-source-actions,
  .kt-popup-text-result__actions { gap: 0; }
}
`;
