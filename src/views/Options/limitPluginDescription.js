const MAX_CHARS = 1000;

// Trim the rendered text tree so partial Markdown never breaks links or formatting.
export default function limitPluginDescription() {
  return (tree) => {
    let remaining = MAX_CHARS;
    let lastText;
    let truncated = false;

    function trim(node) {
      if (node.type === "text" && node.value) {
        if (!remaining) {
          truncated = true;
          return false;
        }
        const characters = Array.from(node.value.slice(0, (remaining + 1) * 2));
        truncated = characters.length > remaining;
        if (truncated) node.value = characters.slice(0, remaining).join("");
        remaining -= Math.min(remaining, characters.length);
        if (!remaining) lastText = node;
      } else if (node.children) {
        node.children = node.children.filter(
          (child) => !truncated && trim(child)
        );
      }
      return true;
    }

    trim(tree);
    if (truncated)
      lastText.value = Array.from(lastText.value).slice(0, -1).join("") + "…";
  };
}
