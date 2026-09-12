import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  SettingsAdvanced,
  SettingsCard,
  SettingsRange,
  SettingsRow,
  SettingsSegmented,
} from "./SettingsCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@mui/material/Slider", () => {
  return function MockSlider({ value, onChange, onChangeCommitted }) {
    const ReactApi = jest.requireActual("react");
    return ReactApi.createElement("input", {
      type: "range",
      value,
      onInput: (event) => onChange(event, Number(event.currentTarget.value)),
      onMouseUp: (event) =>
        onChangeCommitted(event, Number(event.currentTarget.value)),
    });
  };
});

function renderSegmented({ initialValue, items, onChange = jest.fn() }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness() {
    const [value, setValue] = useState(initialValue);
    return (
      <SettingsSegmented
        value={value}
        label="Display mode"
        items={items}
        onChange={(nextValue) => {
          onChange(nextValue);
          setValue(nextValue);
        }}
      />
    );
  }

  act(() => root.render(<Harness />));

  return {
    container,
    onChange,
    radios: () => [...container.querySelectorAll('[role="radio"]')],
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function pressKey(element, key) {
  act(() => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key })
    );
  });
}

function focus(element) {
  act(() => element.focus());
}

describe("SettingsAdvanced", () => {
  test("links each summary to its own named region", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <>
          <SettingsAdvanced label="Translation details">First</SettingsAdvanced>
          <SettingsAdvanced label="Dictionary details">Second</SettingsAdvanced>
        </>
      );
    });

    const summaries = Array.from(
      container.querySelectorAll(".MuiAccordionSummary-root")
    );
    const regions = summaries.map((summary) =>
      document.getElementById(summary.getAttribute("aria-controls"))
    );
    expect(new Set(summaries.map((summary) => summary.id)).size).toBe(2);
    expect(new Set(regions.map((region) => region.id)).size).toBe(2);
    regions.forEach((region, index) => {
      expect(region.getAttribute("role")).toBe("region");
      expect(
        document.getElementById(region.getAttribute("aria-labelledby"))
      ).toBe(summaries[index]);
    });

    act(() => summaries[0].click());
    expect(
      summaries.map((summary) => summary.getAttribute("aria-expanded"))
    ).toEqual(["true", "false"]);
    expect(regions[0].textContent).toBe("First");
    expect(regions[1].textContent).toBe("");

    act(() => root.unmount());
    container.remove();
  });

  test("mounts advanced content lazily and keeps it mounted", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <SettingsAdvanced label="Details">
          <span data-testid="advanced-content">Advanced content</span>
        </SettingsAdvanced>
      );
    });

    const summary = container.querySelector(".MuiAccordionSummary-root");
    expect(
      container.querySelector('[data-testid="advanced-content"]')
    ).toBeNull();

    act(() => {
      summary.click();
    });
    expect(
      container.querySelector('[data-testid="advanced-content"]')
    ).not.toBeNull();

    act(() => {
      summary.click();
    });
    expect(
      container.querySelector('[data-testid="advanced-content"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("keeps layout spacing outside the accordion and supports flat rows", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <SettingsAdvanced rows className="about-override" label="Details">
          <SettingsRow label="One">Control</SettingsRow>
        </SettingsAdvanced>
      );
    });

    const shell = container.querySelector(".kt-settings-advanced-shell");
    const accordion = shell.querySelector(".kt-settings-advanced");
    expect(shell.classList.contains("about-override")).toBe(true);
    expect(accordion.classList.contains("about-override")).toBe(false);

    act(() => accordion.querySelector(".MuiAccordionSummary-root").click());
    const content = accordion.querySelector(".kt-settings-advanced__content");
    const rows = content.querySelector(".kt-settings-advanced__rows");
    expect(content.tagName).toBe("DIV");
    expect(rows.tagName).toBe("UL");
    expect(rows.children).toHaveLength(1);
    expect(rows.firstElementChild.tagName).toBe("LI");

    act(() => root.unmount());
  });
});

describe("SettingsCard", () => {
  test("uses valid list semantics for setting rows", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <SettingsCard>
          <SettingsRow label="Setting">Control</SettingsRow>
        </SettingsCard>
      );
    });

    expect(container.querySelector(".kt-settings-card").tagName).toBe("UL");
    expect(container.querySelector(".kt-settings-row").tagName).toBe("LI");

    act(() => root.unmount());
  });
});

describe("SettingsRange", () => {
  test("updates its preview continuously and persists only on commit", () => {
    const onChange = jest.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <SettingsRange
          value={20}
          min={0}
          max={100}
          unit=" ms"
          label="Delay"
          onChange={onChange}
        />
      );
    });
    const input = container.querySelector('input[type="range"]');

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set.call(input, "30");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector("output").textContent).toBe("30 ms");
    expect(onChange).not.toHaveBeenCalled();

    act(() =>
      input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    );
    expect(onChange).toHaveBeenCalledWith(30);
    act(() => root.unmount());
  });
});

describe("SettingsSegmented", () => {
  const items = [
    { value: "first", label: "First" },
    { value: "disabled", label: "Disabled", disabled: true },
    { value: "middle", label: "Middle" },
    { value: "last", label: "Last" },
  ];

  test("exposes radio semantics with only the selected item tabbable", () => {
    const view = renderSegmented({ initialValue: "middle", items });
    const radios = view.radios();

    expect(
      containerRole(view.container, "radiogroup").getAttribute("aria-label")
    ).toBe("Display mode");
    expect(radios.map((radio) => radio.tabIndex)).toEqual([-1, -1, 0, -1]);
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);
    expect(radios[1].disabled).toBe(true);
    expect(radios.every((radio) => !radio.hasAttribute("aria-pressed"))).toBe(
      true
    );

    view.unmount();
  });

  test("falls back to the first enabled item when the value is unavailable", () => {
    const view = renderSegmented({ initialValue: "missing", items });

    expect(view.radios().map((radio) => radio.tabIndex)).toEqual([
      0, -1, -1, -1,
    ]);
    expect(
      view.radios().map((radio) => radio.getAttribute("aria-checked"))
    ).toEqual(["false", "false", "false", "false"]);

    view.unmount();
  });

  test.each(["ArrowRight", "ArrowDown"])(
    "%s moves forward, skips disabled items, and wraps",
    (key) => {
      const view = renderSegmented({ initialValue: "first", items });
      const first = view.radios()[0];
      focus(first);

      pressKey(first, key);
      expect(document.activeElement).toBe(view.radios()[2]);
      expect(view.radios()[2].getAttribute("aria-checked")).toBe("true");

      pressKey(view.radios()[2], key);
      expect(document.activeElement).toBe(view.radios()[3]);

      pressKey(view.radios()[3], key);
      expect(document.activeElement).toBe(view.radios()[0]);
      expect(view.onChange.mock.calls).toEqual([
        ["middle"],
        ["last"],
        ["first"],
      ]);

      view.unmount();
    }
  );

  test.each(["ArrowLeft", "ArrowUp"])(
    "%s moves backward, skips disabled items, and wraps",
    (key) => {
      const view = renderSegmented({ initialValue: "first", items });
      const first = view.radios()[0];
      focus(first);

      pressKey(first, key);
      expect(document.activeElement).toBe(view.radios()[3]);
      expect(view.radios()[3].getAttribute("aria-checked")).toBe("true");

      pressKey(view.radios()[3], key);
      expect(document.activeElement).toBe(view.radios()[2]);

      pressKey(view.radios()[2], key);
      expect(document.activeElement).toBe(view.radios()[0]);
      expect(view.onChange.mock.calls).toEqual([
        ["last"],
        ["middle"],
        ["first"],
      ]);

      view.unmount();
    }
  );

  test("Home and End select and focus the first and last enabled items", () => {
    const view = renderSegmented({ initialValue: "middle", items });

    pressKey(view.radios()[2], "End");
    expect(document.activeElement).toBe(view.radios()[3]);
    expect(view.radios()[3].tabIndex).toBe(0);

    pressKey(view.radios()[3], "Home");
    expect(document.activeElement).toBe(view.radios()[0]);
    expect(view.radios()[0].tabIndex).toBe(0);
    expect(view.onChange.mock.calls).toEqual([["last"], ["first"]]);

    view.unmount();
  });

  test("ignores unrelated keys", () => {
    const view = renderSegmented({ initialValue: "first", items });
    const first = view.radios()[0];
    focus(first);

    pressKey(first, "PageDown");
    expect(document.activeElement).toBe(first);
    expect(view.onChange).not.toHaveBeenCalled();

    view.unmount();
  });
});

function containerRole(container, role) {
  return container.querySelector(`[role="${role}"]`);
}
