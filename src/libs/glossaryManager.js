import ShadowDomManager from "./shadowDomManager";
import { APP_CONSTS, EVENT_KISS_INNER, MSG_OPEN_GLOSSARY_PANEL } from "../config";
import GlossaryPanel from "../views/GlossaryPanel";

export class GlossaryManager extends ShadowDomManager {
  constructor({ translator, processActions }) {
    super({
      id: APP_CONSTS.glossaryID,
      className: "notranslate",
      reactComponent: GlossaryPanel,
      props: { translator, processActions },
    });
  }

  toggle(props) {
    if (this.isVisible) {
      document.dispatchEvent(
        new CustomEvent(EVENT_KISS_INNER, {
          detail: { action: MSG_OPEN_GLOSSARY_PANEL },
        })
      );
    } else {
      this.show(props || this._props);
    }
  }
}
