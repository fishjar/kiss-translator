import { act } from "react";
import { createRoot } from "react-dom/client";
import SettingsSearchTarget, {
  findSettingsSearchTarget,
  getSettingsSearchHighlight,
  getSettingsSearchShape,
  getSettingsSearchRadius,
} from "./SettingsSearchTarget";
import { SettingsAdvanced, SettingsRow } from "./SettingsCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("ignores hidden editors when locating a localized field", () => {
  const container = document.createElement("div");
  container.innerHTML =
    '<div hidden><label>Timeout</label></div><div aria-hidden="true"><label>Timeout</label></div><label id="visible">Timeout</label>';
  expect(findSettingsSearchTarget(container, "Timeout").id).toBe("visible");
});

test("locates links and accordion summaries as well as input labels", () => {
  const container = document.createElement("div");
  container.innerHTML =
    '<a href="#">Project website</a><div class="MuiButtonBase-root">Project details</div>';
  expect(findSettingsSearchTarget(container, "Project website").tagName).toBe(
    "A"
  );
  expect(findSettingsSearchTarget(container, "Project details").tagName).toBe(
    "DIV"
  );
});

test("prefers a stable setting key over duplicate or renamed labels", () => {
  const container = document.createElement("div");
  container.innerHTML =
    '<label>Appearance</label><section hidden data-settings-search-id="appearance"></section><section id="panel" data-settings-search-id="appearance"><h2>New appearance title</h2><input /></section>';
  expect(
    findSettingsSearchTarget(container, "Appearance", "appearance").id
  ).toBe("panel");
});

test("highlights the complete setting scope without swallowing neighboring rows", () => {
  const container = document.createElement("div");
  container.innerHTML = `
    <section id="panel"><h2>Panel</h2><input /></section>
    <ul><li id="row" class="kt-settings-row"><strong>Row</strong><div class="MuiFormControl-root"><label id="row-label">Row</label><input /></div></li><li>Other</li></ul>
    <div id="field" class="MuiFormControl-root"><label>Field</label><input /><span>Helper</span></div>
    <div id="switch" class="MuiFormControlLabel-root"><span class="MuiTypography-root">Switch</span><input type="checkbox" /></div>
    <div id="custom" data-settings-search-scope><h3>Custom panel</h3><input /></div>
    <div id="accordion" class="MuiAccordion-root"><div class="MuiAccordionSummary-root"><h3>Details</h3></div><input /></div>
  `;
  for (const [selector, expected] of [
    ["#panel h2", "panel"],
    ["#row strong", "row"],
    ["#row-label", "row"],
    ["#field label", "field"],
    ["#switch span", "switch"],
    ["#custom h3", "custom"],
    ["#accordion h3", "accordion"],
  ]) {
    expect(
      getSettingsSearchHighlight(container.querySelector(selector)).id
    ).toBe(expected);
  }
});

test("uses straight highlights for list rows and rounded highlights for panels", () => {
  const container = document.createElement("div");
  container.innerHTML = `
    <ul><li id="row" class="kt-settings-row"><strong>Row</strong></li></ul>
    <div class="kt-overview-settings"><div class="MuiGrid-container"><div id="overview-item" class="MuiGrid-item"><div class="MuiFormControl-root"><label>Overview</label></div></div></div></div>
    <section id="panel" data-settings-search-id="panel"><h2>Panel</h2></section>
  `;
  expect(getSettingsSearchShape(container.querySelector("#row strong"))).toBe(
    "row"
  );
  expect(
    getSettingsSearchShape(container.querySelector("#overview-item label"))
  ).toBe("row");
  expect(getSettingsSearchShape(container.querySelector("#panel"))).toBe(
    "panel"
  );
});

test("preserves asymmetric corners, follows input shapes, and allows explicit overrides", () => {
  const container = document.createElement("div");
  container.innerHTML = `
    <section id="panel" style="border-top-left-radius:16px;border-top-right-radius:8px;border-bottom-right-radius:0px;border-bottom-left-radius:12px 20px"></section>
    <div id="field" class="MuiFormControl-root"><div class="MuiInputBase-root" style="border-top-left-radius:10px;border-top-right-radius:10px;border-bottom-right-radius:10px;border-bottom-left-radius:10px"></div><span>Helper</span></div>
    <div id="row" class="kt-settings-row"><div class="MuiInputBase-root" style="border-top-left-radius:10px"></div></div>
    <section id="custom" style="--kt-settings-search-radius:0px"></section>
  `;
  document.body.appendChild(container);
  expect(getSettingsSearchRadius(container.querySelector("#panel"))).toBe(
    "16px 8px 0px 12px / 16px 8px 0px 20px"
  );
  expect(getSettingsSearchRadius(container.querySelector("#field"))).toBe(
    "10px 10px 10px 10px / 10px 10px 10px 10px"
  );
  expect(getSettingsSearchRadius(container.querySelector("#row"))).toBe("0px");
  expect(getSettingsSearchRadius(container.querySelector("#custom"))).toBe(
    "0px"
  );
  container.remove();
});

test("guides a hidden conditional field to its prerequisite without changing settings", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <SettingsSearchTarget
        target="data_sync_user"
        label="Sync account"
        fallbackLabel="Sync type"
      >
        <label>Sync type</label>
      </SettingsSearchTarget>
    );
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
  const target = container.querySelector(
    '[data-settings-search-target="data_sync_user"]'
  );
  expect(target.textContent).toBe("Sync type");
  act(() => root.unmount());
  container.remove();
});

test("opens a lazy advanced section, focuses the matching row, and cleans up on navigation", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const scroll = jest.fn();
  const originalScroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scroll;
  const render = (target) =>
    root.render(
      <SettingsSearchTarget
        target={target}
        label={target ? "Combo timeout" : ""}
        navigationKey={target}
      >
        <SettingsAdvanced rows label="Advanced">
          <SettingsRow label="Combo timeout">
            <input defaultValue="500" />
          </SettingsRow>
        </SettingsAdvanced>
      </SettingsSearchTarget>
    );
  act(() => render(""));
  expect(container.querySelector("input")).toBeNull();
  await act(async () => {
    render("combo_timeout");
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  const row = container.querySelector("[data-settings-search-target]");
  expect(row).not.toBeNull();
  expect(document.activeElement).toBe(row);
  expect(scroll).toHaveBeenCalledWith({ block: "center", behavior: "instant" });
  expect(container.querySelector("input").value).toBe("500");
  expect(row.style.getPropertyValue("--kt-settings-search-radius")).toBe("0px");
  act(() => render(""));
  expect(container.querySelector("[data-settings-search-target]")).toBeNull();
  expect(row.hasAttribute("tabindex")).toBe(false);
  expect(row.hasAttribute("data-settings-search-positioned")).toBe(false);
  expect(row.style.getPropertyValue("--kt-settings-search-radius")).toBe("");
  act(() => root.unmount());
  container.remove();
  HTMLElement.prototype.scrollIntoView = originalScroll;
});
