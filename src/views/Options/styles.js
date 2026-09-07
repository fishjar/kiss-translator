const NARROW_OPTIONS_MAIN_STYLES = String.raw`
  .kt-overview-top { grid-template-columns: 1fr; }
  .kt-sync-methods { grid-template-columns: 1fr; }
  .kt-style-grid { grid-template-columns: 1fr; }
  .kt-overview-settings .MuiFormControl-root { grid-template-columns: 1fr; gap: 7px; padding-block: 11px; }
  .kt-overview-settings .MuiInputLabel-root,
  .kt-overview-settings .MuiInputBase-root { grid-column: 1; }
  .kt-overview-settings .MuiInputLabel-root { grid-row: 1; }
  .kt-overview-settings .MuiInputBase-root { grid-row: 2; width: 100%; }
  .kt-settings-row { align-items: flex-start; flex-direction: column; gap: 10px; padding: 14px 15px; }
  .kt-settings-row__control { width: 100%; max-width: none; justify-content: stretch; }
  .kt-settings-select,
  .kt-settings-segmented,
  .kt-settings-range { width: 100%; max-width: none; }
  .kt-settings-segmented > button { padding-inline: 8px; font-size: 10.5px; }
  .kt-settings-segmented--trigger { grid-template-columns: repeat(2, minmax(0, 1fr)); display: grid; border-radius: 12px; }
`;

const NARROW_API_LAYOUT_STYLES = String.raw`
  .kt-api-master-detail { grid-template-columns: minmax(0, 1fr); }
`;

const NARROW_PLAYGROUND_STYLES = String.raw`
  .kt-playground-translator.MuiStack-root { grid-template-columns: minmax(0, 1fr); }
  .kt-playground-translator__source,
  .kt-playground-translator__results { grid-column: 1; }
  .kt-playground-config__header { align-items: flex-start; flex-direction: column; gap: 10px; }
  .kt-playground-config__normalize { max-width: 100%; }
`;

export const OPTIONS_STYLES = String.raw`
.kt-options-shell { min-height: 100vh; background: var(--kt-bg); color: var(--kt-on); }
.kt-options-background { position: relative; z-index: 0; }
.kt-options-mobile-header { display: none; }
.kt-options-layout { min-height: 100vh; display: grid; grid-template-columns: 270px minmax(0, 1fr); }
.kt-options-sidebar {
  width: 270px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  z-index: 20;
  overflow: hidden;
  border-right: 1px solid var(--kt-linev);
  background: var(--kt-bg);
}
.kt-options-brand { min-height: 68px; display: flex; align-items: center; gap: 10px; padding: 14px 22px 10px; color: var(--kt-on); text-decoration: none; }
.kt-options-brand img { border-radius: 9px; }
.kt-options-brand__name { font-size: 14px; font-weight: 700; }
.kt-options-brand__name,
.kt-options-brand__version { display: block; }
.kt-options-brand__version { margin-top: 1px; color: var(--kt-onv); font-size: 10.5px; }
.kt-options-search { display: flex; align-items: center; gap: 10px; margin: 0 14px 12px; padding: 0 15px; border-radius: 999px; background: var(--kt-sf3); color: var(--kt-onv); transition: outline-color .15s ease; }
.kt-options-search:focus-within { outline: 3px solid var(--kt-pri); outline-offset: 2px; }
.kt-options-search svg { width: 19px; height: 19px; flex: none; }
.kt-options-search input { width: 100%; height: 46px; border: 0; outline: 0; background: transparent; font-size: 13px; }
.kt-m3-root .kt-options-search input:focus { outline: none; }
@supports selector(:focus-visible) {
  .kt-m3-root .kt-options-search input:focus-visible { outline: none; }
}
.kt-options-nav { flex: 1; overflow-y: auto; padding: 2px 14px 22px; }
.kt-options-nav__group { margin-top: 14px; }
.kt-options-nav__group:first-child { margin-top: 0; }
.kt-options-nav__label { margin: 0 14px 6px; color: var(--kt-onv); font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.kt-options-nav__link { min-height: 44px; display: flex; align-items: center; gap: 13px; padding: 0 16px; border-radius: 999px; color: var(--kt-onv); text-decoration: none; font-size: 13px; font-weight: 550; transition: background .3s var(--kt-spring), color .3s, transform .15s; }
@media (hover: hover) {
  .kt-options-nav__link:hover { background: var(--kt-sf2); color: var(--kt-on); }
}
.kt-options-nav__link:active { transform: scale(.98); }
.kt-options-nav__link.active { background: var(--kt-pric); color: var(--kt-onpric); font-weight: 650; }
.kt-options-nav__link svg { width: 20px; height: 20px; flex: none; }
.kt-options-nav__empty { padding: 24px 16px; color: var(--kt-onv); font-size: 12px; text-align: center; }
.kt-options-sidebar__close { width: 40px; height: 40px; display: grid; place-items: center; position: absolute; top: 14px; right: 12px; z-index: 1; padding: 0; border: 0; border-radius: 999px; background: transparent; color: var(--kt-onv); cursor: pointer; }
@media (hover: hover) {
  .kt-options-sidebar__close:hover { background: var(--kt-sf2); color: var(--kt-on); }
}
.kt-options-sidebar__close svg { width: 22px; height: 22px; }
.kt-options-overlay { display: none; }

.kt-options-main { min-width: 0; padding: 38px clamp(24px, 5vw, 72px) 80px; container-name: options-main; container-type: inline-size; }
.kt-options-main__inner { width: min(790px, 100%); margin: 0 auto; }
.kt-options-main__inner--wide { width: min(1120px, 100%); }
.kt-options-page-header { margin: 0 0 26px; }
.kt-options-page-header h1 { margin: 0; color: var(--kt-on); font-size: clamp(27px, 3vw, 31px); font-weight: 650; letter-spacing: -.035em; line-height: 1.2; }
.kt-options-page-header p { margin: 8px 0 0; color: var(--kt-onv); font-size: 13.5px; line-height: 1.5; }
.kt-options-version-alert { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; padding: 12px 16px; border-radius: 12px; background: var(--kt-terc); color: var(--kt-onterc); font-size: 12px; }
.kt-options-version-alert a { color: inherit; font-weight: 700; }
.kt-options-page { min-width: 0; }

.kt-options-page .MuiAlert-root { border: 0; border-radius: 12px; background: var(--kt-sf1); color: var(--kt-onv); }
.kt-options-page .MuiTextField-root { min-width: 0; }
.kt-options-page .MuiInputLabel-root.MuiInputLabel-shrink { max-width: calc(125% - 24px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-options-page .kt-translation-text-field .MuiInputBase-root { min-height: 128px; align-items: flex-start; overflow: visible; padding: 0; border-radius: 16px; }
.kt-options-page .kt-translation-text-field .MuiInputBase-inputMultiline { box-sizing: border-box; padding: 30px 58px 54px 16px; border: 0; outline: 0; background: transparent; line-height: 1.55; }
.kt-options-page .kt-translation-text-field .MuiInputBase-inputMultiline:not([aria-hidden="true"]) { min-height: 128px; }
.kt-options-page .kt-translation-text-field .MuiInputLabel-root { transform: translate(16px, 16px) scale(1); }
.kt-options-page .kt-translation-text-field .MuiInputLabel-root.MuiInputLabel-shrink { transform: translate(16px, 7px) scale(.75); }
.kt-options-page .kt-translation-text-field__actions { position: absolute; right: 16px; bottom: 16px; z-index: 1; }
.kt-options-page .kt-translation-text-field__actions .MuiIconButton-root { width: 34px; height: 34px; background: var(--kt-secc); color: var(--kt-onsecc); }
@media (hover: hover) {
  .kt-options-page .kt-translation-text-field__actions .MuiIconButton-root:hover { background: var(--kt-secc); background: color-mix(in srgb, var(--kt-onsecc) 8%, var(--kt-secc)); }
}
.kt-options-page .kt-translation-text-field__actions .MuiIconButton-root.Mui-focusVisible { background: var(--kt-secc); background: color-mix(in srgb, var(--kt-onsecc) 10%, var(--kt-secc)); }
.kt-options-page .kt-translation-text-field__actions .MuiIconButton-root.Mui-disabled { background: var(--kt-sf2); color: var(--kt-line); }
.kt-options-page .kt-translation-text-field--source textarea { caret-color: var(--kt-pri); }
.kt-options-page .kt-translation-text-field--result textarea { cursor: default; }
.kt-options-page .MuiFormControlLabel-root { min-height: 40px; gap: 8px; margin-inline: 0; }
.kt-options-page .MuiFormControlLabel-label { font-size: 13px; font-weight: 550; }
.kt-options-page .MuiAccordion-root { border-radius: 12px !important; background: var(--kt-sf0); }
.kt-options-page .MuiAccordion-root.Mui-expanded { margin-block: 0; }
.kt-options-page .MuiAccordion-root:not(:last-child) { margin-bottom: 8px; }
.kt-options-page .kt-rule-accordion:not(:last-child) { margin-bottom: 8px; }
.kt-options-page .MuiAccordionSummary-root { min-height: 58px; padding-inline: 18px; }
.kt-options-page .MuiAccordionSummary-root.kt-rule-summary--with-switch { padding-inline-start: 76px; }
.kt-options-page .MuiButton-root { white-space: nowrap; }
.kt-options-page .MuiSwitch-root.MuiSwitch-sizeSmall { width: 52px; height: 32px; padding: 0; overflow: visible; }
.kt-options-page .MuiSwitch-root.MuiSwitch-sizeSmall .MuiSwitch-switchBase { width: 32px; height: 32px; display: grid; place-items: center; top: 0; left: 0; padding: 0; transform: none; }
.kt-options-page .MuiSwitch-root.MuiSwitch-sizeSmall .MuiSwitch-switchBase.Mui-checked { padding: 0; transform: translateX(20px); }
.kt-options-page .MuiSwitch-root.MuiSwitch-sizeSmall .MuiSwitch-thumb { width: 16px; height: 16px; }
.kt-options-page .MuiSwitch-root.MuiSwitch-sizeSmall .MuiSwitch-switchBase.Mui-checked .MuiSwitch-thumb { width: 24px; height: 24px; }
.kt-options-page .MuiTabs-root { width: fit-content; max-width: 100%; }
.kt-options-page img { max-width: 100%; height: auto; }
.kt-options-page pre,
.kt-options-page table { max-width: 100%; display: block; overflow: auto; }
.kt-options-page pre { padding: 14px; border-radius: 8px; background: var(--kt-sf1); }
.kt-options-page code,
.kt-options-page a { overflow-wrap: anywhere; }
.kt-about-markdown ul,
.kt-about-markdown ol { max-width: 100%; margin-inline: 0; padding-inline-start: 24px; }
.kt-about-markdown li { min-width: 0; overflow-wrap: anywhere; }
.kt-options-page pre > code { min-width: 100%; display: block; overflow-wrap: normal; }
.kt-playground { min-width: 0; container: playground / inline-size; }
.kt-playground__tabs { margin-bottom: 18px; }
.kt-playground-translator.MuiStack-root { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 14px; }
.kt-playground-config { min-width: 0; grid-column: 1 / -1; padding: 18px; border: 1px solid var(--kt-linev); border-radius: 16px; background: var(--kt-sf0); }
.kt-playground-config__header { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 16px; }
.kt-playground-config__copy { min-width: 0; }
.kt-playground-config__copy h2 { margin: 0; color: var(--kt-on); font-size: 14px; font-weight: 700; letter-spacing: -.01em; }
.kt-playground-config__copy p { margin: 4px 0 0; color: var(--kt-onv); font-size: 11.5px; line-height: 1.45; }
.kt-playground-config__normalize { width: fit-content; flex: none; }
.kt-playground-config__grid.MuiGrid-container { width: 100%; display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; margin: 0; }
.kt-playground-config__grid.MuiGrid-container > .MuiGrid-item { width: auto; max-width: none; flex-basis: auto; padding: 0 !important; }
.kt-playground-config__grid .MuiSelect-select { text-overflow: ellipsis; }
.kt-playground-config__grid input[readonly] { color: var(--kt-onv); -webkit-text-fill-color: var(--kt-onv); }
.kt-playground-translator__source { min-width: 0; grid-column: 1; }
.kt-playground-translator__results { min-width: 0; grid-column: 2; }
.kt-playground-translator__result { min-width: 0; }
.kt-playground-translator__empty { min-height: 128px; display: grid; place-items: center; padding: 20px; border: 1px dashed var(--kt-linev); border-radius: 16px; background: var(--kt-sf1); color: var(--kt-onv); font-size: 12px; line-height: 1.5; text-align: center; }
.kt-playground-translator__auxiliary { min-width: 0; grid-column: 1 / -1; }
.kt-playground-translator__source .MuiFormControl-root,
.kt-playground-translator__result .MuiFormControl-root { width: 100%; }
.kt-options-section-title { margin: 0 0 10px !important; color: var(--kt-onv); font-size: 11px !important; font-weight: 700 !important; letter-spacing: .08em !important; text-transform: uppercase; }
.kt-settings-section { margin-top: 26px; }
.kt-settings-section:first-child { margin-top: 0; }
.kt-settings-section > h2 { margin: 0 4px 9px; color: var(--kt-on); font-size: 12px; font-weight: 700; letter-spacing: .02em; }
.kt-settings-card { margin: 0; overflow: hidden; padding: 0; border: 1px solid var(--kt-linev); border-radius: 12px; background: var(--kt-sf0); list-style: none; }
.kt-settings-row { min-height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 11px 18px 11px 20px; border-top: 1px solid var(--kt-linev); }
.kt-settings-row:first-child { border-top: 0; }
.kt-settings-row__copy { min-width: 0; flex: 1; }
.kt-settings-row__copy > strong { display: block; color: var(--kt-on); font-size: 13.5px; font-weight: 650; line-height: 1.35; }
.kt-settings-row__copy > span { display: block; margin-top: 3px; color: var(--kt-onv); font-size: 11.5px; line-height: 1.4; }
.kt-settings-row__control { min-width: 0; max-width: 58%; display: flex; flex: none; align-items: center; justify-content: flex-end; gap: 8px; }
.kt-settings-row--stacked { align-items: flex-start; flex-direction: column; gap: 10px; }
.kt-settings-row--stacked .kt-settings-row__control { width: 100%; max-width: none; justify-content: stretch; }
.kt-settings-row--trigger .kt-settings-segmented { width: 100%; }
.kt-settings-select { min-width: 112px; max-width: 260px; }
.kt-settings-select .MuiFilledInput-root { min-height: 40px; border-radius: 12px; }
.kt-settings-select .MuiSelect-select { padding: 9px 34px 9px 14px; color: var(--kt-on); font-size: 12px; font-weight: 600; text-overflow: ellipsis; }
.kt-settings-segmented { width: max-content; min-width: 260px; max-width: 100%; gap: 2px; overflow: hidden; padding: 3px; border: 1px solid color-mix(in srgb, var(--kt-linev) 72%, transparent); border-radius: 999px; background: var(--kt-sf2); box-shadow: inset 0 1px 2px rgba(0, 0, 0, .04); }
.kt-settings-segmented > button { min-height: 34px; flex: 1; overflow: hidden; padding-inline: 12px; border: 0 !important; border-radius: 999px !important; color: var(--kt-onv); font-size: 11.5px; text-transform: none; transition: background-color .2s ease, color .2s ease, box-shadow .2s ease; white-space: nowrap; }
.kt-settings-segmented > button.Mui-selected { background: var(--kt-secc); color: var(--kt-onsecc); font-weight: 650; }
@media (hover: hover) {
  .kt-settings-segmented > button.Mui-selected:hover { background: var(--kt-secc); }
}
.kt-settings-segmented__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-settings-segmented > button svg { width: 15px; height: 15px; flex: none; }
.kt-settings-segmented > button:focus { outline: none; box-shadow: inset 0 0 0 2px var(--kt-pri); }
.kt-settings-segmented > button[aria-checked="true"]:focus { box-shadow: inset 0 0 0 2px var(--kt-onsecc); }
@supports selector(:focus-visible) {
  .kt-settings-segmented > button:focus { box-shadow: none; }
  .kt-settings-segmented > button:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--kt-pri); }
  .kt-settings-segmented > button[aria-checked="true"]:focus-visible { box-shadow: inset 0 0 0 2px var(--kt-onsecc); }
}
@supports (box-shadow: inset 0 0 0 2px color-mix(in srgb, red 50%, transparent)) {
  .kt-settings-segmented > button:focus-visible { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--kt-pri) 58%, transparent); }
  .kt-settings-segmented > button[aria-checked="true"]:focus-visible { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--kt-onsecc) 55%, transparent); }
}
.kt-settings-range { min-width: 220px; display: grid; grid-template-columns: minmax(120px, 1fr) 58px; align-items: center; gap: 12px; }
.kt-settings-range .MuiSlider-root { color: var(--kt-pri); }
.kt-settings-range output { padding: 6px 9px; border-radius: 8px; background: var(--kt-sf2); color: var(--kt-onv); font-family: ui-monospace, monospace; font-size: 10.5px; text-align: center; }
.kt-settings-keys { display: inline-flex; align-items: center; gap: 5px; }
.kt-settings-keys kbd { min-width: 28px; padding: 3px 7px; border: 1px solid var(--kt-linev); border-bottom-width: 2px; border-radius: 7px; background: var(--kt-sf0); color: var(--kt-on); font-family: ui-monospace, monospace; font-size: 10px; text-align: center; }
.kt-settings-keys--empty { color: var(--kt-onv); }
.kt-settings-advanced-shell { margin-top: 18px; }
.kt-settings-advanced.MuiAccordion-root,
.kt-settings-advanced.MuiAccordion-root.Mui-expanded { margin: 0; overflow: hidden; border: 1px solid var(--kt-linev); border-radius: 12px !important; background: var(--kt-sf0); }
.kt-settings-advanced .MuiAccordionSummary-root { min-height: 52px; padding: 0 18px; color: var(--kt-pri); font-size: 12px; font-weight: 700; }
.kt-settings-advanced .MuiAccordionSummary-content { margin-block: 12px; }
.kt-settings-advanced .MuiAccordionSummary-expandIconWrapper { color: var(--kt-pri); }
.kt-settings-advanced .kt-settings-advanced__content { padding: 4px 12px 14px; border-top: 1px solid var(--kt-linev); animation: kt-m3-rise .3s var(--kt-spring); }
.kt-settings-advanced-shell--rows .kt-settings-advanced__content { padding: 0; }
.kt-settings-advanced__rows { margin: 0; padding: 0; list-style: none; }
.kt-settings-advanced__content > .MuiTextField-root { width: 100%; margin-top: 12px; }
.kt-settings-card .MuiButton-root { min-height: 38px; padding-inline: 15px; font-size: 11.5px; }
.kt-settings-card .MuiSwitch-root { margin-inline: 2px; }
.kt-shortcut-input--compact { width: min(230px, 100%); align-items: center; }
.kt-shortcut-input--compact .MuiTextField-root { min-width: 0; }
.kt-shortcut-input--compact .MuiFilledInput-root { min-height: 40px; border-radius: 12px; }
.kt-shortcut-input--compact .MuiFilledInput-input { padding-block: 9px; font-family: ui-monospace, monospace; font-size: 11px; }
.kt-shortcut-input--compact .MuiIconButton-root { width: 38px; height: 38px; flex: none; }
.kt-style-manager { margin-top: 20px; }
.kt-style-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.kt-style-grid .kt-style-card { margin: 0 !important; border-radius: 12px !important; }
.kt-style-grid .kt-style-card.Mui-expanded { grid-column: 1 / -1; }
.kt-style-card .MuiAccordionSummary-root { min-height: 124px; align-items: stretch; }
.kt-style-card .MuiAccordionSummary-content { min-width: 0; margin: 0; }
.kt-style-card__summary { min-width: 0; display: flex; flex: 1; flex-direction: column; justify-content: center; gap: 3px; padding: 12px 0; color: var(--kt-on); }
.kt-style-card__summary > span { overflow: hidden; font-size: 12px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.kt-style-card__summary > .MuiTypography-root { margin-top: 7px; color: var(--kt-onv); font-size: 11px; font-weight: 700; }
.kt-overview-top { display: grid; grid-template-columns: 1.35fr 1fr; gap: 14px; margin-bottom: 20px; }
.kt-overview-hero { min-height: 200px; display: flex; flex-direction: column; position: relative; padding: 24px; border-radius: 16px; background: var(--kt-pric); color: var(--kt-onpric); overflow: hidden; }
.kt-overview-hero__header { display: flex; align-items: center; gap: 13px; }
.kt-overview-hero__icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 16px; background: var(--kt-pri); color: var(--kt-onpri); }
.kt-overview-hero__icon svg { width: 26px; height: 26px; }
.kt-overview-hero__copy { min-width: 0; flex: 1; }
.kt-overview-hero__title { display: block; font-size: 17px; font-weight: 700; }
.kt-overview-hero__subtitle { display: block; margin-top: 3px; font-size: 11.5px; opacity: .75; }
.kt-overview-hero__summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: auto; padding-top: 20px; }
.kt-overview-hero__summary-item { min-width: 0; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--kt-sf0) 45%, transparent); }
.kt-overview-hero__summary-item span { display: block; overflow: hidden; font-size: 9.5px; opacity: .75; text-overflow: ellipsis; white-space: nowrap; }
.kt-overview-hero__summary-item strong { display: block; margin-top: 3px; overflow: hidden; font-size: 11.5px; text-overflow: ellipsis; white-space: nowrap; }
.kt-overview-shortcuts { padding: 20px; border-radius: 16px; background: var(--kt-sf1); }
.kt-overview-shortcuts h2 { margin: 0 0 12px; font-size: 13px; font-weight: 700; }
.kt-overview-shortcut { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 25px; color: var(--kt-onv); font-size: 11.5px; }
.kt-overview-shortcut__keys { display: flex; gap: 4px; }
.kt-overview-shortcut kbd { min-width: 24px; padding: 2px 5px; border: 1px solid var(--kt-linev); border-bottom-width: 2px; border-radius: 6px; background: var(--kt-sf0); color: var(--kt-on); font-family: ui-monospace, monospace; font-size: 9.5px; text-align: center; }
.kt-overview-settings > .MuiGrid-container { width: 100%; display: block; overflow: hidden; margin: 0; padding: 0; border: 1px solid var(--kt-linev); border-radius: 12px; background: var(--kt-sf0); }
.kt-overview-settings > .MuiGrid-container > .MuiGrid-item { width: 100%; max-width: none; min-height: 64px; display: flex; align-items: stretch; padding: 0 !important; border-bottom: 1px solid var(--kt-linev); }
.kt-overview-settings > .MuiGrid-container > .MuiGrid-item:last-child { border-bottom: 0; }
.kt-overview-settings .MuiFormControl-root { width: 100%; min-height: 63px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(190px, 250px); align-items: center; column-gap: 18px; padding: 8px 12px 8px 16px; }
.kt-overview-settings .MuiInputLabel-root,
.kt-overview-settings .MuiInputLabel-root.MuiInputLabel-shrink { max-width: none; grid-column: 1; grid-row: 1; position: static; overflow: visible; transform: none; color: var(--kt-on); font-size: 13px; font-weight: 600; white-space: normal; pointer-events: none; }
.kt-overview-settings .MuiInputBase-root { grid-column: 2; grid-row: 1; margin: 0; }
.kt-overview-settings .MuiFilledInput-input { padding-block: 9px; }
.kt-overview-settings .MuiFormHelperText-root { grid-column: 1 / -1; margin-inline: 0; }

.kt-api-master-detail { min-width: 0; }
.kt-api-list { margin: 0; padding: 0; list-style: none; scrollbar-gutter: stable; }
.kt-api-list__item,
.kt-api-list__card { min-width: 0; width: 100%; }
.kt-api-provider-icon { width: 38px !important; height: 38px !important; border: 1px solid var(--kt-linev); border-radius: 50%; background: #fff; }
.kt-api-detail { min-width: 0; padding: 22px; border: 1px solid var(--kt-linev); border-radius: 16px; background: var(--kt-sf0); animation: kt-m3-rise .35s var(--kt-spring); }
.kt-api-detail__header { padding-bottom: 16px; border-bottom: 1px solid var(--kt-linev); }
.kt-api-detail__footer { padding-top: 16px; border-top: 1px solid var(--kt-linev); }
.kt-api-detail__primary-actions,
.kt-api-detail__secondary-actions,
.kt-api-detail__status-actions { flex-wrap: wrap; }
.kt-sync-methods { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.kt-sync-method { min-height: 116px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 16px; border: 1px solid var(--kt-linev); border-radius: 12px; background: var(--kt-sf0); box-shadow: inset 0 0 0 0 transparent; color: var(--kt-on); cursor: pointer; text-align: left; transition: border-color .3s, background-color .3s, box-shadow .3s, color .3s, transform .15s; }
.kt-sync-method:active { transform: scale(.98); }
.kt-sync-method[aria-checked="true"] { border-color: var(--kt-pri); background: var(--kt-pric); box-shadow: inset 0 0 0 1px var(--kt-pri); color: var(--kt-onpric); }
.kt-sync-method svg { width: 25px; height: 25px; color: var(--kt-pri); }
.kt-sync-method[aria-checked="true"] svg { color: currentColor; }
.kt-sync-method__name { font-size: 13.5px; font-weight: 700; }
.kt-sync-method__description { color: var(--kt-onv); font-size: 10.5px; line-height: 1.4; transition: color .3s ease, opacity .3s ease; }
.kt-sync-method[aria-checked="true"] .kt-sync-method__description { color: inherit; opacity: .72; }
.kt-word-card { margin-bottom: 9px !important; }
.kt-word-toolbar { padding: 10px 12px; border-radius: 12px; background: var(--kt-sf1); }
.kt-word-export-more { display: flex; flex-wrap: wrap; gap: 8px; margin-top: -14px; padding: 12px; border: 1px solid var(--kt-linev); border-radius: 12px; background: var(--kt-sf0); animation: kt-m3-rise .3s var(--kt-spring); }
.kt-word-card__summary { min-width: 0; display: flex; flex: 1; align-items: center; gap: 10px; }
.kt-word-card__copy { min-width: 0; flex: 1; }
.kt-word-card__word-row { min-width: 0; display: flex; align-items: center; gap: 8px; }
.kt-word-card__word-row > strong { min-width: 0; overflow: hidden; font-size: 15px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.kt-word-card__word-row > span { color: var(--kt-onv); font-family: ui-monospace, monospace; font-size: 10.5px; }
.kt-word-card__word-row > em { padding: 2px 7px; border-radius: 999px; background: var(--kt-terc); color: var(--kt-onterc); font-size: 9.5px; font-style: normal; font-weight: 700; }
.kt-word-card__copy > small { max-width: 540px; display: block; margin-top: 4px; overflow: hidden; color: var(--kt-onv); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.kt-word-card__summary > time { flex: none; color: var(--kt-onv); font-family: ui-monospace, monospace; font-size: 10px; }
.kt-word-empty { min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 28px; border: 1px dashed var(--kt-linev); border-radius: 16px; background: var(--kt-sf1); color: var(--kt-onv); text-align: center; }
.kt-word-empty svg { width: 34px; height: 34px; color: var(--kt-pri); }
.kt-word-empty strong { color: var(--kt-on); font-size: 14px; }
.kt-word-empty span { max-width: 360px; font-size: 12px; line-height: 1.5; }
.kt-about-hero { min-height: 390px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 42px 24px; text-align: center; }
.kt-about-hero__logo { border-radius: 16px; box-shadow: var(--kt-shadow-1); }
.kt-about-hero h2 { margin: 18px 0 0; color: var(--kt-on); font-size: 21px; font-weight: 750; letter-spacing: -.02em; }
.kt-about-hero h2 span { font-weight: 650; }
.kt-about-hero__version { margin-top: 7px; padding: 4px 10px; border-radius: 999px; background: var(--kt-sf2); color: var(--kt-onv); font-family: ui-monospace, monospace; font-size: 10px; font-weight: 700; }
.kt-about-hero p { max-width: 390px; margin: 13px 0 0; color: var(--kt-onv); font-size: 13px; line-height: 1.55; }
.kt-about-hero small { margin-top: 5px; color: var(--kt-onv); font-size: 11px; }
.kt-about-hero__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 19px; }
.kt-about-details { margin-top: 0; }
.kt-about-details .kt-settings-advanced .kt-settings-advanced__content { padding: 0; }
.kt-about-loading { min-height: 120px; display: grid; place-items: center; }
.kt-about-markdown { padding: 20px; }

@media (max-width: 1179px) {
  .kt-options-layout { display: block; }
  .kt-options-mobile-header { min-height: 62px; display: flex; align-items: center; gap: 10px; position: sticky; top: 0; z-index: 30; padding: 8px 14px; border-bottom: 1px solid var(--kt-linev); background: var(--kt-bg); backdrop-filter: blur(14px); }
  .kt-options-mobile-header__name { flex: 1; font-size: 14px; font-weight: 700; }
  .kt-options-sidebar { position: fixed; left: 0; transform: translateX(-105%); transition: transform .35s var(--kt-spring); box-shadow: var(--kt-shadow-2); }
  .kt-options-sidebar--open { transform: translateX(0); }
  .kt-options-sidebar--open .kt-options-brand { padding-right: 60px; }
  .kt-options-overlay { display: block; position: fixed; inset: 0; z-index: 15; border: 0; background: rgba(0, 0, 0, .35); opacity: 0; pointer-events: none; transition: opacity .25s; }
  .kt-options-overlay--open { opacity: 1; pointer-events: auto; }
  .kt-options-main { padding: 26px 18px 60px; }
  @supports (background: color-mix(in srgb, white 92%, transparent)) {
    .kt-options-mobile-header { background: color-mix(in srgb, var(--kt-bg) 92%, transparent); }
  }
}

@media (max-width: 620px) {
  .kt-options-main { padding-inline: 14px; }
}

@container options-main (max-width: 620px) {
${NARROW_OPTIONS_MAIN_STYLES}
}

@container options-main (max-width: 720px) {
${NARROW_API_LAYOUT_STYLES}
}

@container playground (max-width: 760px) {
${NARROW_PLAYGROUND_STYLES}
}

@supports not (container-type: inline-size) {
  /* Add the mobile main's 36px horizontal padding to each content breakpoint.
     The desktop layout starts with 792px of content, above all three cutoffs. */
  @media (max-width: 656px) {
${NARROW_OPTIONS_MAIN_STYLES}
  }
  @media (max-width: 756px) {
${NARROW_API_LAYOUT_STYLES}
  }
  @media (max-width: 796px) {
${NARROW_PLAYGROUND_STYLES}
  }
}
`;
