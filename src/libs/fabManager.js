import ShadowDomManager from "./shadowDomManager";
import { APP_CONSTS } from "../config";
import ContentFab from "../views/Action/ContentFab";

export class FabManager extends ShadowDomManager {
  constructor({ processActions, fabConfig }) {
    super({
      id: APP_CONSTS.fabID,
      className: "notranslate",
      reactComponent: ContentFab,
      props: { processActions, fabConfig },
    });

    if (!fabConfig?.isHide) {
      this.show();
    }
  }
}
