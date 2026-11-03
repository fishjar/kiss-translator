import ShadowDomManager from "./shadowDomManager";
import RuleEditor from "../views/RuleEditor";
import { RuleEditorSession } from "./ruleEditorSession";
import { RULE_EDITOR_ID } from "./ruleEditorDom";

export class RuleEditorManager extends ShadowDomManager {
  constructor({ translator, pauseInteractions, onEditingChange, onSaved }) {
    super({
      id: RULE_EDITOR_ID,
      className: "notranslate",
      reactComponent: RuleEditor,
    });
    this.onEditingChange = onEditingChange;
    this.onSaved = onSaved;
    this.translator = translator;
    this.pauseInteractions = pauseInteractions;
  }
  open() {
    if (this.session) return;
    this.onEditingChange?.(true);
    this.resumeInteractions = this.pauseInteractions();
    this.session = new RuleEditorSession({
      translator: this.translator,
      onExit: () => this.close(true),
    });
    this.session.onSaved = this.onSaved;
    this.show({ session: this.session });
    if (!this.isVisible) {
      this.session = null;
      this.onEditingChange?.(false);
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
  close(confirmed = false) {
    if (this.session?.state.saving) return;
    if (this.session && !confirmed) return this.session.requestAction("exit");
    this.session?.dispose();
    this.session = null;
    super.destroy();
    this.onEditingChange?.(false);
    this.resumeInteractions?.();
    this.resumeInteractions = null;
  }
  destroy() {
    this.onEditingChange?.(false);
    this.session?.dispose(false);
    this.session = null;
    this.resumeInteractions = null;
    super.destroy();
  }
}
