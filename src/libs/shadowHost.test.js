import {
  isolateShadowHost,
  removeStaleShadowHosts,
  setShadowHostVisible,
  SHADOW_HOST_ATTRIBUTE,
} from "./shadowHost";

describe("Shadow host isolation", () => {
  test("uses author-inline important resets and preserves visibility control", () => {
    const host = document.createElement("div");

    expect(isolateShadowHost(host)).toBe(host);
    expect(host.hasAttribute(SHADOW_HOST_ATTRIBUTE)).toBe(true);
    expect(host.style.getPropertyValue("all")).toBe("initial");
    expect(host.style.getPropertyPriority("all")).toBe("important");
    expect(host.style.getPropertyValue("display")).toBe("block");
    expect(host.style.getPropertyPriority("display")).toBe("important");
    expect(host.style.getPropertyValue("direction")).toBe("ltr");
    expect(host.style.getPropertyPriority("direction")).toBe("important");
    expect(host.style.getPropertyValue("unicode-bidi")).toBe("normal");
    expect(host.style.getPropertyPriority("unicode-bidi")).toBe("important");

    setShadowHostVisible(host, false);
    expect(host.style.getPropertyValue("display")).toBe("none");
    expect(host.style.getPropertyPriority("display")).toBe("important");

    setShadowHostVisible(host, true);
    expect(host.style.getPropertyValue("display")).toBe("block");
    expect(host.style.getPropertyPriority("display")).toBe("important");
  });

  test("removes marked and legacy hosts without touching foreign collisions", () => {
    const ids = {
      boxID: "kiss-translator-box",
      fabID: "kiss-translator-fab",
      popupID: "kiss-translator-popup",
    };
    const markedHost = document.createElement("div");
    markedHost.id = ids.fabID;
    markedHost.setAttribute(SHADOW_HOST_ATTRIBUTE, "");
    const legacyHost = document.createElement("div");
    legacyHost.id = `${ids.popupID}-1`;
    legacyHost.className = "notranslate";
    const legacyShadow = legacyHost.attachShadow({ mode: "open" });
    const legacyWrapper = document.createElement("div");
    legacyWrapper.className = `${legacyHost.id}_wrapper notranslate`;
    legacyShadow.appendChild(legacyWrapper);
    const foreignCollision = document.createElement("div");
    foreignCollision.id = ids.boxID;
    const wrongLegacyHost = document.createElement("div");
    wrongLegacyHost.id = ids.popupID;
    wrongLegacyHost.className = "notranslate";
    const wrongLegacyShadow = wrongLegacyHost.attachShadow({ mode: "open" });
    const wrongLegacyWrapper = document.createElement("div");
    wrongLegacyWrapper.className = "someone-else_wrapper notranslate";
    wrongLegacyShadow.appendChild(wrongLegacyWrapper);
    const nonNumericPopup = document.createElement("div");
    nonNumericPopup.id = `${ids.popupID}-custom`;
    isolateShadowHost(nonNumericPopup);
    document.body.append(
      markedHost,
      legacyHost,
      foreignCollision,
      wrongLegacyHost,
      nonNumericPopup
    );

    expect(removeStaleShadowHosts(ids)).toBe(2);
    expect(markedHost.isConnected).toBe(false);
    expect(legacyHost.isConnected).toBe(false);
    expect(foreignCollision.isConnected).toBe(true);
    expect(wrongLegacyHost.isConnected).toBe(true);
    expect(nonNumericPopup.isConnected).toBe(true);

    foreignCollision.remove();
    wrongLegacyHost.remove();
    nonNumericPopup.remove();
  });
});
