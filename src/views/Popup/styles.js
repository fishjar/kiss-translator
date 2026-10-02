export const POPUP_STYLES = String.raw`
.kt-popup-shell {
  width: 396px;
  /* Chrome measures this document from a minimal initial viewport. Expose its
     natural size and let the document own scrolling after native clamping. */
  max-width: none;
  min-width: 0;
  max-height: none;
  overflow: visible;
  background: var(--kt-sf0);
  color: var(--kt-on);
  --kt-popup-muted: #5F6368;
  --kt-popup-focus: #A8C7FA;
  --kt-popup-selected: #E8F0FE;
  --kt-popup-translated-text: #0842A0;
  --kt-popup-danger-hover: #FCEEEE;
}

.kt-m3-root[data-theme="dark"] .kt-popup-shell,
.kt-m3-root[data-theme="dark"] .kt-popup-menu {
  --kt-popup-muted: var(--kt-onv);
  --kt-popup-focus: var(--kt-pri);
  --kt-popup-selected: var(--kt-pric);
  --kt-popup-translated-text: var(--kt-onpric);
  --kt-popup-danger-hover: var(--kt-errc);
}

/* The initial focus guard targets the shell without drawing a control ring. */
.kt-popup-shell:focus,
.kt-popup-shell:focus-visible { outline: none; }

/* The native window owns the frame; translation uses the available canvas. */
.kt-popup-shell--window {
  width: 100%;
  min-width: 0;
  min-height: 100dvh;
  max-height: none;
  overflow: visible;
}

.kt-popup-shell--window .kt-popup-text-panel,
.kt-popup-shell--window .kt-popup-loading {
  width: 100%;
  min-width: 0;
  margin: 0;
}

.kt-popup-shell--window .kt-popup-text-panel { min-height: 100dvh; display: flex; flex-direction: column; }
.kt-popup-shell--window .kt-translation-panel,
.kt-popup-shell--window .kt-translation-panel__body,
.kt-popup-shell--window .kt-tranbox-content,
.kt-popup-shell--window .kt-tranbox-content > .MuiStack-root { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.kt-popup-shell--window .kt-translation-source textarea:not([aria-hidden="true"]) { min-height: 72px; }
.kt-popup-shell--window .kt-translation-result { flex: 1; display: flex; flex-direction: column; min-height: 180px; }
.kt-popup-shell--window .kt-translation-result > .MuiFormControl-root,
.kt-popup-shell--window .kt-translation-result .MuiInputBase-root { flex: 1; }
.kt-popup-shell--window .kt-translation-result .MuiInputBase-root { align-items: stretch; }
/* Neutralize TextareaAutosize's inline height so the unlocked result stretches.
   TranCont retains ownership of resize and its hidden-state behavior. */
.kt-popup-shell--window .kt-translation-result textarea:not([aria-hidden="true"]) { flex: 1; height: auto !important; min-height: 140px; overflow-y: auto !important; }
/* Override the unlocked rule with higher specificity for explicitly locked
   results, preserving scrolling regardless of global stylesheet order. */
.kt-popup-shell--window .kt-translation-result .kt-height-locked textarea:not([aria-hidden="true"]) { height: 100% !important; }

.kt-popup-shell.kt-popup-shell--content { width: 100%; min-width: 0; max-height: none; overflow: visible; }
.kt-popup-chrome { position: sticky; top: 0; z-index: 20; background: var(--kt-sf0); }
.kt-popup-header { height: 48px; min-height: 48px; display: flex; align-items: center; gap: 6px; padding: 0 8px 0 12px; background: var(--kt-sf0); }
.kt-popup-header__logo { width: 26px; height: 26px; border-radius: 8px; }
.kt-popup-brand-button { display: block; flex: none; padding: 0; border: 0; border-radius: 8px; background: transparent; cursor: pointer; }
.kt-popup-header__identity { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.kt-popup-header__title { min-width: 0; max-width: 100%; overflow: hidden; font-size: 14px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-header__version { color: var(--kt-line); font-size: 10.5px; }
.kt-popup-header__spacer { flex: 1; }
.kt-popup-header__drag { display: flex; flex: none; color: var(--kt-onv); cursor: move; }
.kt-popup-header__actions { display: flex; flex: none; align-items: center; gap: 6px; margin-left: auto; }
.kt-popup-header .MuiIconButton-root { width: 32px; height: 32px; flex: none; padding: 0; border: 0; border-radius: 12px; background: transparent; color: var(--kt-onv); }
.kt-popup-header .MuiIconButton-root svg { width: 20px; height: 20px; }
.kt-popup-header .MuiIconButton-root:hover { background: var(--kt-sf2); }
.kt-popup-header__sponsor.MuiIconButton-root { background: transparent; color: var(--kt-onv); }
.kt-popup-header__sponsor.MuiIconButton-root:hover { background: var(--kt-sf2); }
.kt-popup-tabs.MuiTabs-root { min-width: 0; min-height: 34px; flex: 0 1 auto; margin: 0 0 0 2px; padding: 3px; border-radius: 12px; background: var(--kt-sf2); }
.kt-popup-tabs .MuiTabs-flexContainer { gap: 2px; }
.kt-popup-tabs .MuiTabs-indicator { display: none; }
.kt-popup-tabs .MuiTab-root { min-width: 0; min-height: 28px; height: 28px; padding: 0 12px; border-radius: 9px; background: transparent; color: var(--kt-onv); font-size: 12.5px; font-weight: 600; line-height: 1; text-transform: none; white-space: nowrap; }
.kt-popup-tabs .MuiTab-root.Mui-selected { background: var(--kt-sf0); color: var(--kt-on); font-weight: 700; box-shadow: 0 1px 2px rgba(0,0,0,.1); }
.kt-popup-tab-label { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-scroll { height: auto; overflow: visible; }
.kt-popup-content { display: flex; flex-direction: column; gap: 10px; padding: 4px 12px 12px; }
.kt-popup-loading { min-height: 260px; display: grid; place-items: center; color: var(--kt-onv); }
.kt-popup-loading svg { animation: kt-m3-spin .8s linear infinite; }

.kt-popup-hero { position: relative; display: grid; grid-template-columns: minmax(0,1fr) 64px; align-items: center; gap: 10px; padding: 12px; border-radius: 12px; background: var(--kt-sf2); transition: background .35s; }
.kt-popup-hero--translated { background: var(--kt-pric); }
.kt-popup-hero--blocked { background: var(--kt-errc); }
.kt-popup-hero__main { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.kt-popup-site-row { min-width: 0; height: 28px; display: flex; align-items: center; gap: 6px; }
.kt-popup-favicon { width: 24px; height: 24px; display: grid; flex: none; place-items: center; border-radius: 50%; background: var(--kt-sf0); }
.kt-popup-favicon img { width: 14px; height: 14px; display: block; object-fit: contain; }
.kt-popup-favicon svg { width: 14px; height: 14px; color: var(--kt-onv); }
.kt-popup-pattern-button { min-width: 0; height: 28px; display: flex; align-items: center; padding: 0 0 0 4px; border: 0; border-radius: 12px; background: transparent; color: var(--kt-on); font-size: 14px; font-weight: 700; cursor: pointer; }
.kt-popup-pattern-button > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-pattern-button svg { width: 18px; height: 18px; flex: none; color: var(--kt-onv); }
.kt-popup-pattern-button:hover { background: color-mix(in srgb, var(--kt-on) 5%, transparent); }
.kt-popup-pattern-button[aria-expanded="true"] { background: color-mix(in srgb, var(--kt-on) 6%, transparent); }
.kt-popup-blocked-badge { min-width: 0; height: 22px; display: flex; align-items: center; gap: 4px; padding: 0 8px 0 6px; overflow: hidden; border-radius: 12px; background: var(--kt-sf0); color: var(--kt-onerrc); font-size: 11px; font-weight: 600; white-space: nowrap; }
.kt-popup-blocked-badge svg { width: 14px; height: 14px; flex: none; }
.kt-popup-language-row { display: grid; grid-template-columns: minmax(0,1fr) 26px minmax(0,1fr); align-items: center; gap: 3px; transition: opacity .3s; }
.kt-popup-language { position: relative; min-width: 0; }
.kt-popup-language-select { position: relative; width: 100%; min-width: 0; height: 36px; display: flex; align-items: center; padding: 0 2px 0 11px; border: 0; border-radius: 12px; background: var(--kt-sf0); color: var(--kt-on); text-align: left; font-size: 13px; font-weight: 600; cursor: pointer; transition: box-shadow .15s; }
.kt-popup-language-select[aria-expanded="true"] { box-shadow: 0 0 0 2px var(--kt-popup-focus, #A8C7FA); }
.kt-popup-language-select > svg { width: 20px; height: 20px; flex: none; color: var(--kt-onv); }
.kt-popup-language-value { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-language-value__primary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-swap.MuiIconButton-root,
.kt-popup-swap26 { width: 26px; height: 26px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--kt-onv); }
.kt-popup-swap.MuiIconButton-root svg,
.kt-popup-swap26 svg { width: 18px; height: 18px; }
.kt-popup-swap.MuiIconButton-root.Mui-disabled,
.kt-popup-swap26:disabled { color: var(--kt-onv); opacity: .35; }
.kt-popup-hero--blocked .kt-popup-language-row { opacity: .38; pointer-events: none; }

.kt-popup-translate-action { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.kt-popup-translate-button { position: relative; width: 56px; height: 56px; display: grid; flex: none; place-items: center; padding: 0; border: 1.5px solid var(--kt-pri); border-radius: 50%; background: var(--kt-pri); color: var(--kt-onpri); box-shadow: 0 0 0 4px color-mix(in srgb, var(--kt-pri) 12%, transparent), 0 4px 10px color-mix(in srgb, var(--kt-pri) 28%, transparent); cursor: pointer; transition: background .25s, color .25s, border-color .25s, box-shadow .25s, transform .15s; }
.kt-popup-translate-button > svg,
.kt-popup-translate-icon svg,
.kt-popup-undo-icon svg { width: 26px; height: 26px; }
.kt-popup-translate-icon,
.kt-popup-undo-icon { display: grid; place-items: center; }
.kt-popup-undo-icon { display: none; }
.kt-popup-translate-label { color: var(--kt-pri); font-size: 11.5px; font-weight: 700; line-height: 1.2; white-space: nowrap; transition: color .25s; }
.kt-popup-translate-button:hover { box-shadow: 0 0 0 6px color-mix(in srgb, var(--kt-pri) 16%, transparent), 0 6px 16px color-mix(in srgb, var(--kt-pri) 36%, transparent); transform: translateY(-1px); }
.kt-popup-translate-button[aria-pressed="true"] { border-color: var(--kt-popup-focus, #A8C7FA); background: var(--kt-sf0); color: var(--kt-pri); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.kt-popup-hero--translated .kt-popup-translate-label { color: var(--kt-popup-translated-text); }
.kt-popup-translate-button[aria-pressed="true"]:hover { border-color: var(--kt-pri); box-shadow: 0 0 0 5px color-mix(in srgb, var(--kt-pri) 10%, transparent), 0 2px 8px color-mix(in srgb, var(--kt-pri) 20%, transparent); transform: none; }
.kt-popup-translate-button[aria-pressed="true"]:hover .kt-popup-translate-icon { display: none; }
.kt-popup-translate-button[aria-pressed="true"]:hover .kt-popup-undo-icon { display: grid; }
.kt-popup-translate-button[aria-pressed="true"]:hover + .kt-popup-translate-label { color: var(--kt-pri); }
.kt-popup-translate-hover-label { display: none; }
.kt-popup-translate-button[aria-pressed="true"]:hover + .kt-popup-translate-label:has(.kt-popup-translate-hover-label) > span:first-child { display: none; }
.kt-popup-translate-button[aria-pressed="true"]:hover + .kt-popup-translate-label > .kt-popup-translate-hover-label { display: inline; }
.kt-popup-translate-check { position: absolute; top: -3px; right: -3px; width: 18px; height: 18px; display: grid; place-items: center; border-radius: 50%; background: var(--kt-pri); color: var(--kt-onpri); box-shadow: 0 0 0 2px var(--kt-pric); }
.kt-popup-translate-check svg { width: 13px; height: 13px; }
.kt-popup-translate-button:hover .kt-popup-translate-check { display: none; }
.kt-popup-hero--busy .kt-popup-translate-button { border-color: var(--kt-pri); background: var(--kt-pri); color: var(--kt-onpri); box-shadow: 0 2px 6px color-mix(in srgb, var(--kt-pri) 25%, transparent); cursor: progress; transform: none; }
.kt-popup-hero--busy .kt-popup-translate-button::before { content: ""; position: absolute; inset: -5px; border: 3px solid color-mix(in srgb, var(--kt-pri) 18%, transparent); border-top-color: var(--kt-pri); border-radius: 50%; animation: kt-m3-spin .8s linear infinite; pointer-events: none; }
.kt-popup-hero--busy .kt-popup-translate-label { color: var(--kt-pri); }
.kt-popup-hero--busy .kt-popup-translate-check { display: none; }
.kt-popup-hero--busy .kt-popup-translate-button:hover .kt-popup-translate-icon { display: grid; }
.kt-popup-hero--busy .kt-popup-translate-button:hover .kt-popup-undo-icon { display: none; }
.kt-popup-hero--blocked .kt-popup-translate-button { border-color: var(--kt-err); background: var(--kt-err); color: var(--kt-onpri); box-shadow: 0 2px 6px color-mix(in srgb, var(--kt-err) 25%, transparent); }
.kt-popup-hero--blocked .kt-popup-translate-button:hover { box-shadow: 0 0 0 5px color-mix(in srgb, var(--kt-err) 14%, transparent), 0 4px 12px color-mix(in srgb, var(--kt-err) 30%, transparent); }
.kt-popup-hero--blocked .kt-popup-translate-button:hover .kt-popup-translate-icon { display: grid; }
.kt-popup-hero--blocked .kt-popup-translate-check,
.kt-popup-hero--blocked .kt-popup-undo-icon { display: none; }
.kt-popup-hero--blocked .kt-popup-translate-label,
.kt-popup-translate-label.kt-popup-translate-label--error { color: var(--kt-err); }
.kt-popup-translate-button:active { transform: scale(.94); }
.kt-popup-hero--busy .kt-popup-translate-button:active { transform: none; }
.kt-popup-hero--no-service .kt-popup-translate-button,
.kt-popup-hero--no-service .kt-popup-translate-button:hover,
.kt-popup-hero--no-service .kt-popup-translate-button:active { border-color: var(--kt-sf4); background: var(--kt-sf3); color: var(--kt-onv); box-shadow: none; cursor: not-allowed; transform: none; }
.kt-popup-hero--no-service .kt-popup-translate-label { color: var(--kt-onv); }

.kt-popup-settings-grid { position: relative; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 6px; transition: opacity .3s; }
.kt-popup-settings-grid[aria-disabled="true"],
.kt-popup-settings-grid--blocked { opacity: .38; pointer-events: none; }
.kt-popup-services-block { position: relative; min-width: 0; grid-column: span 2; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 12px; background: var(--kt-sf2); }
.kt-popup-services { position: relative; min-width: 0; display: grid; flex: 1; grid-template-columns: repeat(3,minmax(0,1fr)); overflow: visible; }
.kt-popup-services-empty { min-width: 0; min-height: 36px; display: flex; flex: 1; align-items: center; justify-content: center; gap: 8px; padding: 0 8px; color: var(--kt-onv); font-size: 12.5px; font-weight: 500; text-align: center; }
.kt-popup-services-empty > svg { width: 18px; height: 18px; flex: none; }
.kt-popup-services-empty > span { min-width: 0; overflow-wrap: anywhere; }
.kt-popup-segment-indicator { position: absolute; top: 0; bottom: 0; left: 0; width: 33.3333%; border-radius: 9px; background: var(--kt-sf0); box-shadow: 0 1px 2px rgba(0,0,0,.12), 0 1px 4px rgba(0,0,0,.06); transition: transform .32s cubic-bezier(.3,1.25,.45,1); pointer-events: none; }
.kt-popup-service { position: relative; min-width: 0; height: 36px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 8px; border: 0; border-radius: 9px; background: transparent; color: var(--kt-onv); font-size: 12.5px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: color .2s; }
.kt-popup-service[aria-pressed="true"],
.kt-popup-service[aria-checked="true"] { color: var(--kt-on); }
.kt-popup-service__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-service-logo { width: 20px; height: 20px; display: grid; flex: none; place-items: center; border: 1px solid var(--kt-sf4); border-radius: 50%; background: #FFFFFF; }
.kt-service-logo img { width: 12px; height: 12px; display: block; object-fit: contain; }
.kt-popup-more-service { height: 36px; display: flex; flex: none; align-items: center; padding: 0 4px 0 9px; border: 0; border-radius: 9px; background: transparent; color: var(--kt-onv); font-size: 12px; font-weight: 700; white-space: nowrap; cursor: pointer; }
.kt-popup-more-service svg { width: 18px; height: 18px; flex: none; }
.kt-popup-more-service:hover,
.kt-popup-more-service[aria-expanded="true"] { background: var(--kt-sf3); }
.kt-popup-style-select { position: relative; min-width: 0; height: 40px; display: flex; align-items: center; gap: 6px; padding: 0 6px 0 12px; border: 0; border-radius: 12px; background: var(--kt-sf2); color: var(--kt-on); cursor: pointer; transition: box-shadow .15s; }
.kt-popup-style-select:hover { background: var(--kt-sf3); }
.kt-popup-style-select[aria-expanded="true"] { box-shadow: 0 0 0 2px var(--kt-popup-focus, #A8C7FA); }
.kt-popup-style-label { flex: none; color: var(--kt-popup-muted); font-size: 11px; font-weight: 600; }
.kt-popup-style-value { min-width: 0; flex: 1; overflow: hidden; font-size: 13px; font-weight: 600; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-style-select > svg { width: 18px; height: 18px; flex: none; color: var(--kt-onv); }
.kt-popup-display-mode { position: relative; min-width: 0; height: 40px; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); padding: 3px; border-radius: 12px; background: var(--kt-sf2); }
.kt-popup-display-mode .kt-popup-segment-indicator { top: 3px; bottom: 3px; left: 3px; width: calc(50% - 3px); }
.kt-popup-display-mode button { position: relative; min-width: 0; overflow: hidden; text-overflow: ellipsis; padding: 0 4px; border: 0; border-radius: 9px; background: transparent; color: var(--kt-onv); font-size: 12px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: color .2s; }
.kt-popup-display-mode button[aria-checked="true"] { color: var(--kt-on); }
.kt-popup-option-row { min-width: 0; height: 36px; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 0 10px 0 12px; border: 0; border-radius: 12px; background: var(--kt-sf2); color: var(--kt-on); font-size: 12px; font-weight: 500; text-align: left; cursor: pointer; }
.kt-popup-option-row:hover { background: var(--kt-sf3); }
.kt-popup-option-row > span:first-child { min-width: 0; display: flex; align-items: center; gap: 5px; }
.kt-popup-option-row > span:first-child > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-switch { position: relative; width: 34px; height: 20px; display: inline-block; flex: none; border: 1.5px solid var(--kt-line); border-radius: 999px; background: var(--kt-sf4); transition: background .25s, border-color .25s; }
.kt-popup-switch > span,
.kt-popup-switch::after { position: absolute; top: 50%; left: 3px; width: 12px; height: 12px; transform: translateY(-50%); border-radius: 999px; background: var(--kt-line); transition: left .3s cubic-bezier(.3,1.4,.4,1), width .2s, height .2s; }
.kt-popup-switch:not(:has(> span))::after { content: ""; }
.kt-popup-switch[data-checked="true"] { border-color: var(--kt-pri); background: var(--kt-pri); }
.kt-popup-switch[data-checked="true"] > span,
.kt-popup-switch[data-checked="true"]::after { left: 15px; width: 14px; height: 14px; background: var(--kt-onpri); }
.kt-popup-editor-button { min-width: 0; height: 40px; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 0 10px 0 12px; border: 0; border-radius: 12px; background: var(--kt-sf2); color: var(--kt-pri); font-size: 12px; font-weight: 700; text-align: left; white-space: nowrap; cursor: pointer; }
.kt-popup-editor-button:hover { background: var(--kt-sf3); }
.kt-popup-editor-button svg { width: 18px; height: 18px; flex: none; margin-inline: 8px; }
.kt-popup-editor-button[aria-busy="true"] { cursor: progress; }
.kt-popup-editor-button[data-error="true"] { color: var(--kt-err); }
.kt-popup-save-button { min-width: 0; height: 40px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border: 0; border-radius: 12px; background: var(--kt-sf2); color: var(--kt-pri); font-size: 13px; font-weight: 700; white-space: nowrap; cursor: pointer; transition: background .25s, color .25s, box-shadow .25s; }
.kt-popup-save-button svg { width: 18px; height: 18px; flex: none; }
.kt-popup-save-button--dirty { background: var(--kt-pri); color: var(--kt-onpri); box-shadow: 0 1px 2px rgba(0,0,0,.2), 0 2px 6px color-mix(in srgb, var(--kt-pri) 20%, transparent); }
.kt-popup-save-button--saved { color: var(--kt-grn); cursor: default; }
.kt-popup-save-button--error { background: var(--kt-errc); color: var(--kt-onerrc); }
.kt-popup-save-button[aria-busy="true"] { cursor: progress; }
.kt-popup-dirty-dot { position: absolute; top: -2px; right: -2px; width: 8px; height: 8px; border-radius: 50%; background: var(--kt-pri); box-shadow: 0 0 0 2px var(--kt-sf0); pointer-events: none; }
.kt-popup-dirty-dot--inline { position: static; width: 6px; height: 6px; flex: none; box-shadow: none; }

.kt-popup-global-features { height: 38px; display: flex; border: 1px solid var(--kt-sf4); border-radius: 12px; overflow: hidden; }
.kt-popup-global-feature { min-width: 0; height: 36px; display: flex; flex: 1; align-items: center; justify-content: center; gap: 4px; padding: 0 6px; border: 0; background: transparent; color: var(--kt-onv); font-size: 12.5px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .25s, color .25s; }
.kt-popup-global-feature + .kt-popup-global-feature { border-left: 1px solid var(--kt-sf4); }
.kt-popup-global-feature[aria-pressed="true"] { background: var(--kt-pric); color: var(--kt-onpric); }
.kt-popup-global-feature > svg { width: 17px; height: 17px; flex: none; }
.kt-popup-global-feature > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-global-feature:hover { box-shadow: inset 0 0 0 99px rgba(31,31,31,.05); }
.kt-popup-global-feature[data-error="true"] { color: var(--kt-err); }
.kt-popup-global-feature[aria-busy="true"] { opacity: 1; cursor: progress; }
/* An inset keyboard ring stays visible inside the clipped segmented frame. */
.kt-popup-global-feature:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--kt-pri); }

.kt-popup-bottom-actions { display: flex; align-items: center; gap: 2px; margin-top: -2px; }
.kt-popup-disable-button,
.kt-popup-cache-button { height: 32px; display: flex; align-items: center; gap: 5px; padding: 0 10px 0 8px; border: 0; border-radius: 12px; background: transparent; color: var(--kt-onv); font-size: 12px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: color .2s; }
.kt-popup-disable-button svg,
.kt-popup-cache-button svg { width: 17px; height: 17px; flex: none; }
.kt-popup-disable-button:hover { background: var(--kt-popup-danger-hover); color: var(--kt-onerrc); }
.kt-popup-cache-button:hover { background: var(--kt-sf2); }
.kt-popup-cache-button[data-status="done"] { color: var(--kt-grn); cursor: default; }
.kt-popup-cache-button[data-status="error"] { color: var(--kt-err); }
.kt-popup-cache-button[data-status="clearing"] { cursor: progress; }
.kt-popup-version { margin-left: auto; padding-right: 6px; color: var(--kt-line); font-size: 11px; white-space: nowrap; }
.kt-popup-action-error { color: var(--kt-err); font-size: 11px; }
.kt-popup-all-settings { min-height: 36px; padding: 0 12px; border: 0; border-radius: 12px; background: var(--kt-sf2); color: var(--kt-pri); font-size: 12px; font-weight: 700; cursor: pointer; }
.kt-popup-all-settings:hover { background: var(--kt-sf3); }

/* Menus are portaled to the theme root, outside the scrolling popup shell. */
.kt-popup-menu.MuiPaper-root,
.kt-popup-language-menu.MuiPaper-root { width: max-content; max-width: calc(100% - 16px); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; padding: 6px; border-radius: 12px; background: var(--kt-sf0); color: var(--kt-on); box-shadow: var(--kt-shadow-2); --kt-popup-muted: #5F6368; --kt-popup-selected: #E8F0FE; }
.kt-popup-menu .MuiMenu-list,
.kt-popup-language-menu .MuiMenu-list { padding: 0; }
.kt-popup-menu .MuiMenuItem-root { border-radius: 8px; }
.kt-popup-menu .MuiMenuItem-root:hover { background: var(--kt-sf2); }
.kt-popup-menu .MuiMenuItem-root.Mui-selected,
.kt-popup-menu .MuiMenuItem-root.Mui-selected:hover { background: var(--kt-popup-selected); }
.kt-popup-menu-title { padding: 6px 10px 4px; color: var(--kt-onv); font-size: 11px; font-weight: 600; }
.kt-popup-menu-check { width: 18px; height: 18px; flex: none; margin-left: auto; color: var(--kt-pri); }
.kt-popup-pattern-option.MuiMenuItem-root { min-height: 0; display: flex; align-items: center; gap: 10px; padding: 7px 10px; }
.kt-popup-pattern-option > svg { width: 20px; height: 20px; flex: none; color: var(--kt-line); }
.kt-popup-pattern-option.Mui-selected > svg { color: var(--kt-pri); }
.kt-popup-pattern-copy { min-width: 0; display: flex; flex-direction: column; line-height: 1.35; }
.kt-popup-pattern-copy > span { font-size: 13px; font-weight: 600; }
.kt-popup-pattern-copy small { color: var(--kt-onv); font-size: 11px; }
.kt-popup-service-option.MuiMenuItem-root { min-height: 38px; height: 38px; display: flex; align-items: center; gap: 10px; padding: 0 10px 0 8px; font-size: 13px; font-weight: 600; }
.kt-popup-service-option .kt-service-logo { width: 22px; height: 22px; }
.kt-popup-service-option .kt-service-logo img { width: 14px; height: 14px; }
.kt-popup-service-option > span:not(.kt-service-logo) { flex: 1; white-space: nowrap; }
.kt-popup-style-menu.MuiPaper-root { width: 322px; padding: 8px; }
.kt-popup-style-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); grid-auto-rows: 34px; align-content: start; gap: 6px; }
.kt-popup-style-chip { min-width: 0; height: 34px; display: flex; align-items: center; justify-content: center; padding: 0 4px; overflow: hidden; border: 1px solid var(--kt-linev); border-radius: 8px; background: var(--kt-sf0); color: var(--kt-on); font-size: 11.5px; font-weight: 600; white-space: nowrap; cursor: pointer; }
.kt-popup-style-chip[aria-pressed="true"] { border-color: var(--kt-pri); background: var(--kt-pric); color: var(--kt-onpric); }
.kt-popup-style-chip > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.kt-popup-language-menu.MuiPaper-root { max-height: min(320px, calc(100% - 16px)); scrollbar-gutter: stable; }
.kt-popup-language-option.MuiMenuItem-root,
.kt-popup-language-menu .MuiMenuItem-root { min-height: 36px; height: 36px; display: flex; align-items: center; gap: 8px; padding: 0 8px 0 10px; }
.kt-popup-language-option__copy { min-width: 0; display: flex; flex: 1; align-items: baseline; gap: 6px; }
.kt-popup-language-option__primary,
.kt-popup-language-menu__primary { flex: none; color: var(--kt-on); font-size: 13px; font-weight: 600; white-space: nowrap; }
.kt-popup-language-option__secondary,
.kt-popup-language-menu__secondary { min-width: 0; overflow: hidden; color: var(--kt-popup-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.kt-popup-language-menu .kt-popup-menu-check { align-self: center; }
.kt-popup-language-divider,
.kt-popup-language-menu .MuiDivider-root { height: 1px; margin: 4px 6px; border: 0; background: var(--kt-sf3); }

.kt-popup-text-panel { padding: 0; animation: kt-m3-rise .35s var(--kt-spring); }
.kt-popup-shell--window .kt-popup-text-panel { padding: 0; animation: none; }
.kt-popup-empty { min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; color: var(--kt-onv); text-align: center; }
.kt-popup-empty__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }

@media (max-width: 359px) {
  .kt-popup-header { gap: 4px; padding-inline: 8px; }
  .kt-popup-header__actions { gap: 2px; }
  .kt-popup-tabs .MuiTab-root { padding-inline: 8px; }
  .kt-popup-blocked-badge { padding-inline: 4px; font-size: 10px; }
}
`;
