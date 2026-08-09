import { getMuiSwitchStyleOverrides } from "./themeStyles";

describe("MUI switch alignment", () => {
  test("centers the switch thumb with a fixed grid in both states", () => {
    const styles = getMuiSwitchStyleOverrides({
      outline: "#777",
      primary: "#06f",
      onPrimary: "#fff",
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
  });
});
