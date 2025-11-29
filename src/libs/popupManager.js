import ShadowDomManager from "./shadowDomManager";
import { APP_CONSTS, EVENT_KISS_INNER, MSG_POPUP_TOGGLE } from "../config";
import Action from "../views/Action";

export class PopupManager extends ShadowDomManager {
  constructor({ translator, processActions }) {
    super({
      id: APP_CONSTS.popupID,
      className: "notranslate",
      reactComponent: Action,
      props: { translator, processActions },
    });
  }

  toggle(props) {
    if (this.isVisible) {
      document.dispatchEvent(
        new CustomEvent(EVENT_KISS_INNER, {
          detail: { action: MSG_POPUP_TOGGLE },
        })
      );
    } else {
      this.show(props || this._props);
    }
  }
}
