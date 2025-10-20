import ShadowDomManager from "./shadowDomManager";
import { APP_CONSTS } from "../config";
import ContentFab from "../views/Action/ContentFab";

export class FabManager extends ShadowDomManager {
  constructor({ translator, popupManager, fabConfig }) {
    super({
      id: APP_CONSTS.fabID,
      className: "notranslate",
      reactComponent: ContentFab,
      props: { translator, popupManager, fabConfig },
    });
  }
}
