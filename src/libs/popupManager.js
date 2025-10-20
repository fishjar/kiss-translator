import ShadowDomManager from "./shadowDomManager";
import { APP_CONSTS } from "../config";
import Action from "../views/Action";

export class PopupManager extends ShadowDomManager {
  constructor({ translator }) {
    super({
      id: APP_CONSTS.popupID,
      className: "notranslate",
      reactComponent: Action,
      props: { translator },
    });
  }
}
