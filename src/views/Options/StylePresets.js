import { DEFAULT_COLOR } from "../../config";

const STYLE_PRESETS = {
  under_line: {
    name: "Underline",
    type: "line",
    lineStyle: "solid",
    defaultColor: DEFAULT_COLOR,
  },
  dot_line: {
    name: "Dotted Underline",
    type: "line",
    lineStyle: "dotted",
    defaultColor: DEFAULT_COLOR,
  },
  dash_line: {
    name: "Dashed Underline",
    type: "line",
    lineStyle: "dashed",
    defaultColor: DEFAULT_COLOR,
  },
  dash_line_bold: {
    name: "Dashed Underline Bold",
    type: "line",
    lineStyle: "dashed",
    defaultBorderWidth: 2,
    defaultColor: DEFAULT_COLOR,
  },
  wavy_line: {
    name: "Wavy Underline",
    type: "line",
    lineStyle: "wavy",
    defaultColor: DEFAULT_COLOR,
  },
  wavy_line_bold: {
    name: "Wavy Underline Bold",
    type: "line",
    lineStyle: "wavy",
    defaultBorderWidth: 2,
    defaultColor: DEFAULT_COLOR,
  },
  dash_box: {
    name: "Dashed Box",
    type: "box",
    borderStyle: "dashed",
    defaultColor: DEFAULT_COLOR,
  },
  dash_box_bold: {
    name: "Dashed Box Bold",
    type: "box",
    borderStyle: "dashed",
    defaultBorderWidth: 2,
    defaultColor: DEFAULT_COLOR,
  },
  marker: {
    name: "Marker",
    type: "background",
    backgroundType: "marker",
    defaultColor: DEFAULT_COLOR,
  },
  gradient_marker: {
    name: "Gradient Marker",
    type: "background",
    backgroundType: "gradient_marker",
    defaultColor: DEFAULT_COLOR,
  },
  highlight: {
    name: "Highlight",
    type: "background",
    backgroundType: "solid",
    defaultColor: DEFAULT_COLOR,
  },
  fuzzy: {
    name: "Fuzzy",
    type: "filter",
    filterType: "blur",
  },
  blockquote: {
    name: "Blockquote",
    type: "border_left",
    defaultColor: DEFAULT_COLOR,
  },
  gradient: {
    name: "Gradient",
    type: "text_gradient",
  },
  blink: {
    name: "Blink",
    type: "animation",
    animationType: "blink",
  },
  glow: {
    name: "Glow",
    type: "animation",
    animationType: "glow",
  },
  colorful: {
    name: "Colorful",
    type: "background",
    backgroundType: "colorful",
  },
};

export const generateStyleCode = (options) => {
  const {
    styleType,
    color = DEFAULT_COLOR,
    borderWidth = 1,
    opacity = 0.8,
    lineStyle = "dashed",
    borderStyle = "dashed",
    backgroundType = "marker",
    filterType = "blur",
    animationType = "blink",
  } = options;

  const rgbColor = hexToRgb(color);
  const rgbaColor = `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, ${opacity})`;

  switch (styleType) {
    case "line":
      return `text-decoration-line: underline;
text-decoration-style: ${lineStyle};
text-decoration-color: ${rgbaColor};
text-decoration-thickness: ${borderWidth}px;
text-underline-offset: 0.3em;
-webkit-text-decoration-line: underline;
-webkit-text-decoration-style: ${lineStyle};
-webkit-text-decoration-color: ${rgbaColor};
-webkit-text-decoration-thickness: ${borderWidth}px;
-webkit-text-underline-offset: 0.3em;
opacity: ${opacity};
-webkit-opacity: ${opacity};
&:hover {
  opacity: 1;
  -webkit-opacity: 1;
}`;

    case "box":
      return `border: ${borderWidth}px ${borderStyle} ${rgbaColor};
display: block;
padding: 0.2em 0.3em;
box-sizing: border-box;`;

    case "background":
      if (backgroundType === "marker") {
        return `background: linear-gradient(to top, ${rgbaColor} 50%, transparent 50%);`;
      } else if (backgroundType === "gradient_marker") {
        return `background: linear-gradient(to top, transparent, ${rgbaColor} 20%, transparent 60%);`;
      } else if (backgroundType === "solid") {
        return `color: #fff;
background-color: ${rgbaColor};`;
      } else if (backgroundType === "colorful") {
        return `color: #333;
background: linear-gradient(
  45deg,
  LightGreen 20%,
  LightPink 20% 40%,
  LightSalmon 40% 60%,
  LightSeaGreen 60% 80%,
  LightSkyBlue 80%
);
&:hover {
  color: #111;
};`;
      }
      return "";

    case "border_left":
      return `opacity: ${opacity};
-webkit-opacity: ${opacity};
display: block;
padding: 0.25em 0.5em;
border-left: 0.25em solid ${rgbaColor};
background: rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, 0.2);
&:hover {
  opacity: 1;
  -webkit-opacity: 1;
}`;

    case "filter":
      if (filterType === "blur") {
        return `filter: blur(0.2em);
-webkit-filter: blur(0.2em);
&:hover {
  filter: none;
  -webkit-filter: none;
}`;
      }
      return "";

    default:
      return `color: ${rgbaColor};`;
  }
};

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 32, g: 156, b: 238 };
};

export const parseStyleCode = (styleCode) => {
  const result = {
    styleType: "custom",
    color: DEFAULT_COLOR,
    borderWidth: 1,
    opacity: 0.8,
  };

  if (!styleCode) return result;

  const colorMatch = styleCode.match(
    /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i
  );
  if (colorMatch) {
    const r = parseInt(colorMatch[1]);
    const g = parseInt(colorMatch[2]);
    const b = parseInt(colorMatch[3]);
    result.color = rgbToHex(r, g, b);
    if (colorMatch[4]) {
      result.opacity = parseFloat(colorMatch[4]);
    }
  }

  const hexMatch = styleCode.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
  if (hexMatch && !colorMatch) {
    result.color = hexMatch[0];
  }

  const borderWidthMatch = styleCode.match(
    /(?:text-decoration-thickness|border(?:-width)?):\s*(\d+)px/i
  );
  if (borderWidthMatch) {
    result.borderWidth = parseInt(borderWidthMatch[1]);
  }

  const opacityMatch = styleCode.match(/opacity:\s*([\d.]+)/i);
  if (opacityMatch) {
    result.opacity = parseFloat(opacityMatch[1]);
  }

  if (styleCode.includes("text-decoration-line: underline")) {
    result.styleType = "line";
    if (styleCode.includes("wavy")) {
      result.lineStyle = "wavy";
    } else if (styleCode.includes("dotted")) {
      result.lineStyle = "dotted";
    } else if (styleCode.includes("dashed")) {
      result.lineStyle = "dashed";
    } else {
      result.lineStyle = "solid";
    }
  } else if (
    styleCode.includes("border:") &&
    styleCode.includes("display: block") &&
    styleCode.includes("padding:")
  ) {
    result.styleType = "box";
    if (styleCode.includes("dotted")) {
      result.borderStyle = "dotted";
    } else if (styleCode.includes("dashed")) {
      result.borderStyle = "dashed";
    } else {
      result.borderStyle = "solid";
    }
  } else if (styleCode.includes("background: linear-gradient")) {
    if (styleCode.includes("to top")) {
      result.styleType = "background";
      if (styleCode.includes("transparent 50%")) {
        result.backgroundType = "marker";
      } else {
        result.backgroundType = "gradient_marker";
      }
    } else {
      result.styleType = "text_gradient";
    }
  } else if (
    styleCode.includes("background-color") ||
    (styleCode.includes("color: #fff") && styleCode.includes("background"))
  ) {
    result.styleType = "background";
    result.backgroundType = "solid";
  } else if (styleCode.includes("border-left:")) {
    result.styleType = "border_left";
  } else if (styleCode.includes("filter: blur")) {
    result.styleType = "filter";
    result.filterType = "blur";
  } else if (styleCode.includes("animation:")) {
    result.styleType = "animation";
    if (styleCode.includes("blink")) {
      result.animationType = "blink";
    } else {
      result.animationType = "glow";
    }
  }

  return result;
};

const rgbToHex = (r, g, b) => {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
};

export const STYLE_TYPES = [
  { value: "line", label: "Underline Style" },
  { value: "box", label: "Box Style" },
  { value: "background", label: "Background Style" },
  { value: "border_left", label: "Quote Style" },
  { value: "filter", label: "Filter Style" },
  { value: "custom", label: "Custom CSS" },
];

export const LINE_STYLES = [
  { value: "solid", label: "Solid" },
  { value: "dotted", label: "Dotted" },
  { value: "dashed", label: "Dashed" },
  { value: "wavy", label: "Wavy" },
];

export const BORDER_STYLES = [
  { value: "solid", label: "Solid" },
  { value: "dotted", label: "Dotted" },
  { value: "dashed", label: "Dashed" },
];

export const BACKGROUND_TYPES = [
  { value: "marker", label: "Marker" },
  { value: "gradient_marker", label: "Gradient Marker" },
  { value: "solid", label: "Solid Background" },
];

export { STYLE_PRESETS };
