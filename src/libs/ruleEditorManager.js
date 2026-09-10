import ShadowDomManager from "./shadowDomManager";
import RuleEditor from "../views/RuleEditor";
import { RuleEditorSession } from "./ruleEditorSession";
import { RULE_EDITOR_ID } from "./ruleEditorDom";

export class RuleEditorManager extends ShadowDomManager {
  constructor({ translator, pauseInteractions }) {
    super({
      id: RULE_EDITOR_ID,
      className: "notranslate",
      reactComponent: RuleEditor,
    });
    this.translator = translator;
    this.pauseInteractions = pauseInteractions;
  }
  open() {
    if (this.session) return;
    this.resumeInteractions = this.pauseInteractions();
    this.session = new RuleEditorSession({
      translator: this.translator,
      onExit: () => this.close(),
    });
    this.show({ session: this.session, onExit: () => this.close() });
    if (!this.isVisible) {
      this.session = null;
      this.resumeInteractions?.();
      this.resumeInteractions = null;
      return;
    }
    this.session
      .start()
      .catch((error) =>
        this.session?.emit({ error: error.message, loading: false })
      );
  }
  close() {
    if (this.session?.state.saving) return;
    this.session?.dispose();
    this.session = null;
    super.destroy();
    this.resumeInteractions?.();
    this.resumeInteractions = null;
  }
  destroy() {
    this.session?.dispose(false);
    this.session = null;
    this.resumeInteractions = null;
    super.destroy();
  }
}
