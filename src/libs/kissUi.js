import { APP_CONSTS, APP_LCNAME } from "../config/app";

// Independent UI roots, including portals outside their original shadow host.
// Source wrappers and word highlights deliberately remain page content.
export const KISS_UI_SELECTOR = `.${APP_LCNAME}-wrapper, .${APP_LCNAME}-hover-bubble,
  .kiss-caption-container, .kiss-subtitle-controls, #kiss-youtube-subtitle-list-container,
  #${APP_CONSTS.fabID}, .${APP_CONSTS.fabID}_warpper, .${APP_CONSTS.fabID}_wrapper,
  #${APP_CONSTS.boxID}, .${APP_CONSTS.boxID}_warpper, .${APP_CONSTS.boxID}_wrapper,
  #${APP_CONSTS.popupID}, .${APP_CONSTS.popupID}_warpper, .${APP_CONSTS.popupID}_wrapper,
  #${APP_CONSTS.imageBoxID}, .${APP_CONSTS.imageBoxID}_wrapper,
  #kiss-rule-editor, #kiss-rule-highlights, [data-kiss-ui],
  #kiss-touch-status, #kiss-subtitle-menus, .kiss-player-feedback,
  .kiss-youtube-tab-header, .kiss-word-tooltip, #KISS-Translator-Message,
  .kt-image-hover-root, .kt-image-manager-layout-root, .kt-image-layout-overlay,
  .kt-image-dual-btn-container, .kt-screenshot-overlay-root,
  .kt-screenshot-persistent-highlight, .kt-image-source-highlight`;
