import { useRef } from "react";
import { TextField } from "@mui/material";

function navigateShadowMenu(event) {
  const list = event.currentTarget;
  const root = list.getRootNode();
  if (
    !root.host ||
    !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
  )
    return;
  // MUI 5 MenuList reads document.activeElement, which is the shadow host.
  // Use the actual focused option for navigation inside this shadow tree.
  const options = [...list.querySelectorAll('[role="option"]')].filter(
    (option) => option.getAttribute("aria-disabled") !== "true"
  );
  if (!options.length) return;
  const index = options.indexOf(root.activeElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : Math.max(
            0,
            Math.min(
              options.length - 1,
              index + (event.key === "ArrowDown" ? 1 : -1)
            )
          );
  event.preventDefault();
  event.stopPropagation();
  options[next].focus();
}

// Keep the menu in the editor's shadow tree so Emotion styles and page
// isolation apply to both the field and its popup.
export default function EditorSelect(props) {
  const field = useRef(null);
  return (
    <TextField
      {...props}
      ref={field}
      select
      fullWidth
      size="small"
      SelectProps={{
        MenuProps: {
          container: () => {
            const root = field.current?.getRootNode();
            return root?.host
              ? field.current.closest(".notranslate")
              : document.body;
          },
          disableScrollLock: true,
          // The document sees the shadow host as activeElement. MUI's modal
          // focus trap would otherwise pull focus away from the menu options.
          disableEnforceFocus: true,
          disableAutoFocus: true,
          MenuListProps: { onKeyDownCapture: navigateShadowMenu },
          sx: { zIndex: 2147483647 },
          PaperProps: {
            sx: {
              overscrollBehavior: "contain",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1.5,
              "& .MuiMenuItem-root": {
                fontSize: 15,
                whiteSpace: "normal",
                overflowWrap: "anywhere",
              },
            },
          },
        },
      }}
    />
  );
}
