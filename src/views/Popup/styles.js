import { SEPARATE_WINDOW_CONTENT_WIDTH } from "../../config/app";

export const POPUP_STYLES = String.raw`
.kt-popup-shell {
  width: 396px;
  /* A percentage cap preserves toolbar popup intrinsic sizing; viewport units
     can lock the browser's initially narrow measurement viewport in place. */
  max-width: 100%;
  min-width: 0;
  overflow: visible;
  background: var(--kt-sf0);
  color: var(--kt-on);
}

/* Fill the separate window while keeping its content centered and readable.
   Dynamic viewport units account for the mobile browser toolbar. */
.kt-popup-shell--window {
  width: 100%;
  min-width: 0;
  min-height: 100dvh;
}

.kt-popup-shell--window .kt-popup-text-panel,
.kt-popup-shell--window .kt-popup-loading {
  width: min(${SEPARATE_WINDOW_CONTENT_WIDTH}px, 100%);
  margin-inline: auto;
}

.kt-popup-shell.kt-popup-shell--content {
  width: 100%;
  min-width: 0;
}

.kt-popup-chrome {
  position: sticky;
  top: 0;
  z-index: 20;
  padding-bottom: 2px;
  background: var(--kt-sf0);
}

.kt-popup-header {
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  background: var(--kt-sf0);
}

.kt-popup-header__logo { border-radius: 8px; }
.kt-popup-brand-button { display: block; padding: 0; border: 0; border-radius: 8px; background: transparent; cursor: pointer; }
.kt-popup-header__identity { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.kt-popup-header__title { min-width: 0; max-width: 100%; overflow: hidden; font-size: 15px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-header__version { padding: 3px 8px; border-radius: 999px; background: var(--kt-sf2); color: var(--kt-onv); font-size: 10.5px; font-weight: 650; }
.kt-popup-header__spacer { flex: 1; }
.kt-popup-header__drag { display: flex; color: var(--kt-onv); cursor: move; }
.kt-popup-header__actions { display: flex; flex: none; align-items: center; gap: 2px; }
.kt-popup-header__actions .MuiIconButton-root { width: 38px; height: 38px; padding: 7px; }
.kt-popup-header__sponsor.MuiIconButton-root { background: var(--kt-secc); color: var(--kt-onsecc); }
.kt-popup-header__sponsor.MuiIconButton-root:hover { background: color-mix(in srgb, var(--kt-secc) 82%, var(--kt-onsecc)); }
.kt-popup-support { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; padding: 8px; border-radius: 16px; background: var(--kt-sf1); }
.kt-popup-support a { min-height: 34px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: 999px; color: var(--kt-pri); font-size: 11px; font-weight: 700; text-decoration: none; }
.kt-popup-support a:hover { background: var(--kt-sf2); }

.kt-popup-tabs { min-height: 44px; margin: 0 14px; }
.kt-popup-tabs .MuiTab-root { min-height: 44px; padding-block: 7px; }
.kt-popup-scroll { height: auto; overflow: visible; }
.kt-popup-content { display: flex; flex-direction: column; gap: 14px; padding: 14px 18px 18px; }

.kt-popup-loading {
  min-height: 260px;
  display: grid;
  place-items: center;
  color: var(--kt-onv);
}

.kt-popup-loading svg { animation: kt-m3-spin .8s linear infinite; }

.kt-popup-hero {
  display: flex;
  align-items: center;
  gap: 13px;
  position: relative;
  overflow: hidden;
  padding: 17px 16px;
  border-radius: 16px;
  background: var(--kt-pric);
  cursor: pointer;
  transition: background .35s var(--kt-spring), transform .15s;
}

.kt-popup-hero:active { transform: scale(.98); }
.kt-popup-hero--off { background: var(--kt-sf2); }

.kt-popup-hero__icon {
  width: 48px;
  height: 48px;
  display: grid;
  flex: none;
  place-items: center;
  border-radius: 16px;
  background: var(--kt-pri);
  color: var(--kt-onpri);
  animation: kt-m3-pop .55s var(--kt-spring);
}

.kt-popup-hero__icon svg { width: 27px; height: 27px; }
.kt-popup-hero--off .kt-popup-hero__icon { background: var(--kt-sf4); color: var(--kt-onv); animation: none; }
.kt-popup-hero--busy .kt-popup-hero__icon { animation: kt-m3-glow 1.1s ease-in-out infinite; }
.kt-popup-hero--busy .kt-popup-hero__icon svg { animation: kt-m3-spin .9s linear infinite; }
.kt-popup-hero__copy { min-width: 0; display: block; flex: 1; }
.kt-popup-hero__title { display: block; color: var(--kt-onpric); font-size: 16px; font-weight: 700; }
.kt-popup-hero--off .kt-popup-hero__title { color: var(--kt-on); }
.kt-popup-hero__subtitle { display: block; margin-top: 3px; overflow: hidden; color: var(--kt-onpric); font-size: 11.5px; opacity: .76; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-hero--off .kt-popup-hero__subtitle { color: var(--kt-onv); opacity: 1; }
.kt-popup-hero__progress { height: 4px; position: absolute; right: 0; bottom: 0; left: 0; background: color-mix(in srgb, var(--kt-pri) 18%, transparent); }
.kt-popup-hero__progress::after { content: ""; position: absolute; inset-block: 0; border-radius: 999px; background: var(--kt-pri); animation: kt-m3-sweep 1.05s ease-in-out infinite; }

.kt-popup-main-switch.MuiSwitch-root { width: 46px; height: 28px; padding: 0; overflow: visible; }
.kt-popup-main-switch .MuiSwitch-switchBase { width: 28px; height: 28px; display: grid; place-items: center; padding: 0; color: var(--kt-line); transform: none; }
.kt-popup-main-switch .MuiSwitch-thumb { width: 18px; height: 18px; box-shadow: none; }
.kt-popup-main-switch .MuiSwitch-track { border: 1.5px solid var(--kt-line); border-radius: 999px; background: var(--kt-sf4); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--kt-line) 14%, transparent); opacity: 1; transition: background .25s, border-color .25s, transform .15s; }
.kt-popup-main-switch .MuiSwitch-input { left: 0; width: 46px; height: 28px; }
.kt-popup-main-switch .MuiSwitch-switchBase.Mui-checked .MuiSwitch-input { left: -18px; }
.kt-popup-main-switch .MuiSwitch-switchBase.Mui-checked { color: var(--kt-onpri); transform: translateX(18px); }
.kt-popup-main-switch .MuiSwitch-switchBase.Mui-checked .MuiSwitch-thumb { width: 20px; height: 20px; }
.kt-popup-main-switch .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track { border-color: var(--kt-pri); background: var(--kt-pri); box-shadow: none; opacity: 1; }
.kt-popup-main-switch .MuiSwitch-switchBase.Mui-disabled { color: var(--kt-onv); }
.kt-popup-main-switch .MuiSwitch-switchBase.Mui-disabled .MuiSwitch-thumb { opacity: .38; }
.kt-popup-main-switch .MuiSwitch-switchBase.Mui-disabled + .MuiSwitch-track { border-color: var(--kt-onv); background: var(--kt-onv); opacity: .12; }
.kt-popup-main-switch .MuiSwitch-switchBase.Mui-checked.Mui-disabled { color: var(--kt-sf0); }
.kt-popup-main-switch .MuiSwitch-switchBase.Mui-checked.Mui-disabled .MuiSwitch-thumb { opacity: 1; }
.kt-popup-main-switch .MuiSwitch-switchBase.Mui-checked.Mui-disabled + .MuiSwitch-track { border-color: var(--kt-onv); background: var(--kt-onv); opacity: .12; }
.kt-popup-main-switch:active .MuiSwitch-track { transform: scale(.96); }

.kt-popup-language-row { display: grid; grid-template-columns: 1fr 40px 1fr; gap: 8px; }
.kt-popup-language {
  min-width: 0;
  padding: 9px 14px;
  border: 0;
  border-radius: 12px;
  background: var(--kt-sf2);
  text-align: left;
}

.kt-popup-language > span { display: block; color: var(--kt-onv); font-size: 10.5px; font-weight: 600; pointer-events: none; }
.kt-popup-language .kt-popup-language-select { width: 100%; margin-top: 1px; color: var(--kt-on); font-size: 13px; font-weight: 600; }
.kt-popup-language-select { border-radius: 12px; }
.kt-popup-language-select .MuiSelect-select { min-height: 0; padding: 0 24px 0 0 !important; border-radius: inherit; color: var(--kt-on); cursor: pointer; transition: background-color .2s ease; }
.kt-popup-language-select .MuiSelect-select.MuiInputBase-input:focus { outline: 3px solid var(--kt-pri); outline-offset: 2px; background: transparent; }
@supports selector(:focus-visible) {
  .kt-popup-language-select .MuiSelect-select.MuiInputBase-input:focus { outline: none; }
  .kt-popup-language-select .MuiSelect-select.MuiInputBase-input:focus-visible { outline: 3px solid var(--kt-pri); outline-offset: 2px; }
}
.kt-popup-language-value { min-width: 0; display: flex; flex-direction: column; line-height: 1.15; }
.kt-popup-language-value__primary,
.kt-popup-language-value__secondary { min-width: 0; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-language-value__secondary { margin-top: 1px; color: var(--kt-onv); font-size: 9.5px; font-weight: 500; }
.kt-popup-language-select .MuiSelect-icon { right: 0; color: var(--kt-onv); transition: transform .2s var(--kt-spring); }
.kt-popup-language-menu.MuiPaper-root { max-height: min(280px, calc(100% - 32px)); margin-top: 6px; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--kt-linev); border-radius: 4px; background: var(--kt-sf1); color: var(--kt-on); box-shadow: var(--kt-shadow-2); }
.kt-popup-language-menu .MuiMenu-list { padding: 4px 0; }
.kt-popup-language-menu .MuiMenuItem-root { min-height: 36px; margin: 2px 6px; padding: 6px 10px; border-radius: 8px; color: var(--kt-on); font-size: 12px; }
.kt-popup-language-menu .MuiMenuItem-root.Mui-selected { background: var(--kt-secc); color: var(--kt-onsecc); font-weight: 650; }
@media (hover: hover) {
  .kt-popup-language-menu .MuiMenuItem-root:hover { background: var(--kt-sf3); }
  .kt-popup-language-menu .MuiMenuItem-root.Mui-selected:hover { background: var(--kt-secc); }
}
.kt-popup-swap.MuiIconButton-root.Mui-disabled { color: var(--kt-line); cursor: not-allowed; opacity: 1; }

.kt-popup-section-label { margin: 0 4px 8px; color: var(--kt-onv); font-size: 11.5px; font-weight: 650; }
.kt-popup-services { display: flex; flex-wrap: nowrap; gap: 6px; margin: -2px; padding: 2px; overflow: visible; }
.kt-popup-services--open { flex-wrap: wrap; overflow: visible; }
.kt-popup-service {
  min-width: 0;
  display: flex;
  flex: 1 1 0;
  align-items: center;
  gap: 7px;
  padding: 5px 11px 5px 6px;
  border: 1.5px solid var(--kt-linev);
  border-radius: 8px;
  background: var(--kt-sf0);
  color: var(--kt-on);
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

@media (hover: hover) {
  .kt-popup-service:hover { background: var(--kt-sf1); }
}
.kt-popup-service[aria-pressed="true"] { border-color: var(--kt-pri); background: var(--kt-pric); color: var(--kt-onpric); font-weight: 650; }
.kt-popup-service__name { min-width: 0; display: block; overflow: hidden; text-overflow: ellipsis; }
.kt-service-logo { width: 22px; height: 22px; display: grid; flex: none; place-items: center; border: 1px solid var(--kt-linev); border-radius: 50%; background: #fff; }
.kt-service-logo img { width: 14px; height: 14px; object-fit: contain; }
.kt-popup-more-service { min-width: max-content; padding-inline: 10px; border-color: transparent; background: var(--kt-sf2); color: var(--kt-onv); font-weight: 650; }
.kt-popup-more-service { flex: 0 0 auto; }
.kt-popup-services--open .kt-popup-service { flex: 0 1 auto; }
.kt-popup-more-service svg { width: 17px; height: 17px; transition: transform .3s var(--kt-spring); }
.kt-popup-more-service[aria-expanded="true"] svg { transform: rotate(180deg); }

.kt-popup-scenes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.kt-popup-scene:last-child:nth-child(odd) { grid-column: 1 / -1; }
.kt-popup-scene {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  background: var(--kt-sf2);
  color: var(--kt-onv);
  cursor: pointer;
  text-align: left;
  transition: background .35s var(--kt-spring), color .35s, transform .15s;
}

.kt-popup-scene:active { transform: scale(.97); }
.kt-popup-scene[aria-pressed="true"] { background: var(--kt-secc); color: var(--kt-onsecc); }
.kt-popup-scene > svg { width: 21px; height: 21px; flex: none; }
.kt-popup-scene__copy { min-width: 0; display: block; flex: 1; }
.kt-popup-scene__label { display: block; font-size: 12px; font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; white-space: normal; }
.kt-popup-scene__state { display: block; margin-top: 1px; font-size: 10.5px; opacity: .72; }

.kt-popup-site { padding: 14px; border: 0; border-radius: 12px; background: var(--kt-sf1); }
.kt-popup-site__top { display: flex; align-items: center; gap: 8px; }
.kt-popup-site__select { min-width: 0; flex: 1; padding: 3px 5px; border: 0; border-radius: 8px; outline: 0; background: transparent; color: var(--kt-on); font-size: 12.5px; font-weight: 650; }
.kt-popup-site__badge { flex: none; padding: 4px 8px; border-radius: 999px; background: var(--kt-terc); color: var(--kt-onterc); font-size: 10.5px; font-weight: 700; }
.kt-popup-site__badge--blocked { background: var(--kt-errc); color: var(--kt-onerrc); }
.kt-popup-site__actions { display: flex; align-items: center; gap: 4px; margin: 10px -4px -4px; }
.kt-popup-site__actions .MuiButton-root { min-height: 36px; padding-inline: 12px; font-size: 11.5px; }
.kt-popup-site__actions .MuiButton-root:first-child { flex: 1; }
.kt-popup-site__actions .MuiIconButton-root { width: 36px; height: 36px; }

.kt-popup-disclosure-row { display: flex; align-items: center; gap: 4px; }
.kt-popup-disclosure { width: auto; min-height: 38px; display: flex; flex: 1; align-items: center; gap: 8px; padding: 0 4px; border: 0; background: transparent; color: var(--kt-onv); cursor: pointer; font-size: 12.5px; font-weight: 650; }
.kt-popup-disclosure::after { content: ""; height: 1px; flex: 1; order: -1; background: var(--kt-linev); }
.kt-popup-disclosure svg { transition: transform .35s var(--kt-spring); }
.kt-popup-disclosure[aria-expanded="true"] svg { transform: rotate(180deg); }
.kt-popup-advanced { display: flex; flex-direction: column; gap: 12px; animation: kt-m3-rise .35s var(--kt-spring); }
.kt-popup-style-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.kt-popup-style-chips--open { padding: 2px; }
.kt-popup-style-chip { min-height: 44px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 1px; padding: 5px 13px; border: 1px solid var(--kt-linev); border-radius: 8px; background: var(--kt-sf0); color: var(--kt-onv); cursor: pointer; font-size: 11.5px; font-weight: 650; }
.kt-popup-style-chip[aria-pressed="true"] { border-color: var(--kt-pri); background: var(--kt-pric); color: var(--kt-onpric); font-weight: 650; }
.kt-popup-style-chip > span { font-size: 11.5px; }
.kt-popup-style-chip > small { color: var(--kt-onv); font-size: 9px; }
.kt-popup-style-chip[aria-pressed="true"] > small { color: inherit; }
.kt-popup-style-more { min-width: max-content; min-height: 44px; flex: 0 0 auto; flex-direction: row; align-items: center; justify-content: center; gap: 5px; padding: 5px 12px; border-color: transparent; background: var(--kt-sf2); color: var(--kt-pri); font-size: 11px; font-weight: 700; }
@media (hover: hover) {
  .kt-popup-style-more:hover { background: var(--kt-sf3); }
}
.kt-popup-style-more svg { width: 17px; height: 17px; transition: transform .3s var(--kt-spring); }
.kt-popup-style-more[aria-expanded="true"] svg { transform: rotate(180deg); }
.kt-popup-advanced-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.kt-popup-advanced-row { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 9px 10px 9px 12px; border-radius: 12px; background: var(--kt-sf2); font-size: 11.5px; font-weight: 550; }
.kt-popup-advanced-row .MuiSwitch-root { margin: -2px -4px; }


.kt-popup-footer { display: flex; align-items: center; gap: 8px; padding-top: 2px; color: var(--kt-onv); font-size: 10.5px; }
.kt-popup-footer__keys { display: flex; align-items: center; gap: 4px; }
.kt-popup-footer kbd { padding: 2px 6px; border: 1px solid var(--kt-linev); border-bottom-width: 2px; border-radius: 6px; background: var(--kt-sf1); color: var(--kt-on); font-family: ui-monospace, monospace; font-size: 9.5px; }
.kt-popup-footer__spacer { flex: 1; }
.kt-popup-footer .MuiButton-root { min-height: 34px; padding-inline: 10px; font-size: 11.5px; }

.kt-popup-text-panel { padding: 14px 18px 18px; animation: kt-m3-rise .35s var(--kt-spring); }
.kt-popup-text-panel .MuiTabs-root { margin-bottom: 12px; }
.kt-popup-translation-form { display: flex; flex-direction: column; gap: 12px; }
.kt-popup-translation-input { overflow: visible; border: 1px solid transparent; border-radius: 16px; background: var(--kt-sf1); transition: border-color .25s, background .25s; }
.kt-popup-translation-input--focused { border-color: var(--kt-pri); outline: 3px solid var(--kt-pri); outline-offset: 2px; background: var(--kt-sf0); }
.kt-popup-translation-input textarea { width: 100%; min-height: 112px; display: block; resize: vertical; padding: 15px 15px 4px; border: 0; outline: 0; background: transparent; color: var(--kt-on); font-size: 13px; line-height: 1.55; }
.kt-m3-root .kt-popup-translation-input textarea:focus { outline: none; }
@supports selector(:focus-visible) {
  .kt-m3-root .kt-popup-translation-input textarea:focus-visible { outline: none; }
}
.kt-popup-translation-input__footer { min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 10px 7px 15px; color: var(--kt-onv); font-size: 10.5px; }
.kt-popup-translation-input__footer .MuiButton-root { min-height: 38px; padding-inline: 15px; }
.kt-popup-translation-input__footer svg { width: 18px; height: 18px; }
.kt-popup-translation-direction { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--kt-pri); font-size: 12px; font-weight: 650; }
.kt-popup-translation-direction .kt-popup-language-select { width: 130px; max-width: calc(50% - 16px); min-width: 0; border-radius: 12px; background: var(--kt-sf2); color: var(--kt-on); font-size: 11.5px; font-weight: 650; }
.kt-popup-translation-direction .kt-popup-language-select .MuiSelect-select { padding: 7px 28px !important; text-align: center; }
.kt-popup-translation-direction .kt-popup-language-value { align-items: center; }
.kt-popup-translation-direction .kt-popup-language-select .MuiSelect-icon { right: 6px; }
.kt-popup-translation-services { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px; border-radius: 12px; background: var(--kt-sf1); animation: kt-m3-rise .3s var(--kt-spring); }
.kt-popup-translation-services button { min-height: 34px; padding: 0 12px; border: 1px solid var(--kt-linev); border-radius: 8px; background: var(--kt-sf0); color: var(--kt-onv); cursor: pointer; font-size: 11px; font-weight: 650; }
.kt-popup-translation-services button[aria-pressed="true"] { border-color: var(--kt-pri); background: var(--kt-pric); color: var(--kt-onpric); font-weight: 650; }
.kt-popup-translation-results { display: flex; flex-direction: column; gap: 9px; }
.kt-popup-translation-result { overflow: hidden; border: 1px solid var(--kt-linev); border-radius: 12px; background: var(--kt-sf0); }
.kt-popup-translation-result > header { min-height: 46px; display: flex; align-items: center; gap: 8px; padding: 7px 8px 7px 14px; border-bottom: 1px solid var(--kt-linev); }
.kt-popup-translation-result > header strong { min-width: 0; flex: 1; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-translation-result > header > span { padding: 3px 7px; border-radius: 999px; background: var(--kt-terc); color: var(--kt-onterc); font-family: ui-monospace, monospace; font-size: 9.5px; font-weight: 700; }
.kt-popup-translation-result > header > div { display: flex; }
.kt-popup-translation-result > header .MuiIconButton-root { width: 32px; height: 32px; padding: 5px; }
.kt-popup-translation-result__body { min-width: 0; min-height: 68px; display: flex; align-items: flex-start; padding: 13px 14px 15px; color: var(--kt-on); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; word-break: break-word; }
.kt-popup-translation-result__error { color: var(--kt-err); }
.kt-popup-translation-result__empty { color: var(--kt-onv); }
.kt-popup-translation-compare { min-height: 42px; display: flex; align-items: center; justify-content: center; gap: 7px; border: 1px dashed var(--kt-line); border-radius: 999px; background: transparent; color: var(--kt-pri); cursor: pointer; font-size: 12px; font-weight: 650; }
.kt-popup-translation-compare svg { width: 18px; height: 18px; transition: transform .3s var(--kt-spring); }
.kt-popup-translation-compare[aria-expanded="true"] svg { transform: rotate(180deg); }
.kt-popup-dictionary { overflow: hidden; padding: 10px 12px 12px; border: 1px solid var(--kt-linev); border-radius: 12px; background: var(--kt-sf0); }
.kt-popup-dictionary .MuiTabs-root { margin-bottom: 8px; }
.kt-popup-dictionary .MuiTab-root { min-height: 36px; font-size: 11.5px; }
.kt-popup-empty { min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; color: var(--kt-onv); text-align: center; }
.kt-popup-empty__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }

.kt-popup-shell:not(.kt-popup-shell--window) .kt-popup-content { gap: 9px; padding: 10px 16px 12px; }
.kt-popup-shell:not(.kt-popup-shell--window) .kt-popup-hero { padding: 12px 14px; border-radius: 16px; }
.kt-popup-shell:not(.kt-popup-shell--window) .kt-popup-hero__icon { width: 40px; height: 40px; border-radius: 12px; }
.kt-popup-shell:not(.kt-popup-shell--window) .kt-popup-hero__icon svg { width: 24px; height: 24px; }
.kt-popup-shell:not(.kt-popup-shell--window) .kt-popup-language { padding: 7px 12px; }
.kt-popup-shell:not(.kt-popup-shell--window) .kt-popup-section-label { margin-bottom: 5px; }
.kt-popup-shell:not(.kt-popup-shell--window) .kt-popup-scenes { gap: 6px; }
.kt-popup-shell:not(.kt-popup-shell--window) .kt-popup-scene { padding: 7px 10px; }
.kt-popup-shell:not(.kt-popup-shell--window) .kt-popup-site { padding: 10px 12px; }
.kt-popup-shell:not(.kt-popup-shell--window) .kt-popup-site__actions { margin: 7px -2px -2px; }
.kt-popup-shell:not(.kt-popup-shell--window) .kt-popup-site__actions .MuiButton-root { min-height: 34px; }
.kt-popup-shell:not(.kt-popup-shell--window) .kt-popup-disclosure { min-height: 34px; }
.kt-popup-shell--window .kt-popup-text-panel { animation: none; }

@media (max-width: 395px) {
  .kt-popup-content { padding-inline: 14px; }
  .kt-popup-tabs { margin-inline: 14px; }
}
`;
