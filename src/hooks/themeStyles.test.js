import { getMuiSwitchStyleOverrides } from "./themeStyles";

describe("MUI switch alignment", () => {
  test("centers the switch thumb with a fixed grid in both states", () => {
    const styles = getMuiSwitchStyleOverrides({
      outline: "#777",
      primary: "#06f",
      onPrimary: "#fff",
      onSurface: "#111",
      surface: "#fafafa",
      surfaceHigh: "#eee",
    });

    expect(styles.switchBase).toEqual(
      expect.objectContaining({
        width: 32,
        height: 32,
        display: "grid",
        placeItems: "center",
        top: 0,
        padding: 0,
        transform: "none",
      })
    );
    expect(styles.switchBase["&.Mui-checked"].transform).toBe(
      "translateX(20px)"
    );
    expect(
      styles.root["&.MuiSwitch-sizeSmall .MuiSwitch-switchBase.Mui-checked"]
        .transform
    ).toBe("translateX(20px)");
    expect(styles.switchBase["&.Mui-checked"]["& .MuiSwitch-input"].left).toBe(
      -20
    );
    expect(styles.input).toMatchObject({
      left: 0,
      width: 52,
      height: 32,
      borderRadius: 999,
    });
    expect(styles.input.transition).toContain("left");
    expect(styles.switchBase.transition).toContain("transform");
    expect(styles.switchBase.transition).not.toContain("all");
    expect(styles.thumb.transition).toContain("width");
    expect(styles.thumb.transition).toContain("height");
    expect(styles.thumb.transition).toContain("opacity");
    expect(styles.track.transition).toContain("background-color");
    expect(
      styles.switchBase["&:not(.Mui-disabled):hover"].backgroundColor
    ).toContain("#111");
    expect(
      styles.switchBase["&.Mui-checked"]["&:not(.Mui-disabled):hover"]
        .backgroundColor
    ).toContain("#06f");
    expect(
      styles.switchBase["&:not(.Mui-disabled):hover"]["@media (hover: none)"]
        .backgroundColor
    ).toBe("transparent");
    expect(styles.switchBase["&:hover"]).toBeUndefined();
    expect(styles.switchBase["&.Mui-checked"]["&:hover"]).toBeUndefined();
    expect(styles.switchBase["&.Mui-focusVisible"]).toMatchObject({
      outline: "3px solid #06f",
      outlineOffset: 0,
    });
  });

  test("defines both disabled states without falling back to MUI colors", () => {
    const styles = getMuiSwitchStyleOverrides({
      outline: "#777",
      primary: "#06f",
      onPrimary: "#fff",
      onSurface: "#111",
      surface: "#fafafa",
      surfaceHigh: "#eee",
    });
    const disabled = styles.switchBase["&.Mui-disabled"];
    const checkedDisabled = styles.switchBase["&.Mui-checked.Mui-disabled"];

    expect(disabled.color).toBe("#111");
    expect(disabled["& .MuiSwitch-thumb"].opacity).toBe(0.38);
    expect(disabled["& + .MuiSwitch-track"]).toMatchObject({
      borderColor: "#111",
      backgroundColor: "#111",
      opacity: 0.12,
    });
    expect(checkedDisabled.color).toBe("#fafafa");
    expect(checkedDisabled["& .MuiSwitch-thumb"].opacity).toBe(1);
    expect(checkedDisabled["& + .MuiSwitch-track"]).toEqual(
      disabled["& + .MuiSwitch-track"]
    );
  });
});
