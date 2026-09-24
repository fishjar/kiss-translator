export const getMenuActiveElement = (menu) =>
  menu?.getRootNode()?.activeElement || menu?.ownerDocument?.activeElement;

const getMenuItems = (menu) =>
  Array.from(
    menu.querySelectorAll('[role^="menuitem"], [role="option"]')
  ).filter(
    (item) =>
      !item.disabled &&
      item.getAttribute("aria-disabled") !== "true" &&
      !item.hidden
  );

// Capture navigation before MUI reads document.activeElement, which is the host
// when focus belongs to a shadow tree. Leave activation and dismissal to callers.
export function createMenuKeyDownHandler({
  shadowOnly = false,
  disableListWrap = false,
} = {}) {
  let previousMenu;
  let prefix = "";
  let lastKeyTime = 0;

  return (event) => {
    const menu = event.currentTarget;
    if (shadowOnly && !menu.getRootNode()?.host) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing)
      return;

    if (menu !== previousMenu) {
      previousMenu = menu;
      prefix = "";
      lastKeyTime = 0;
    }

    const items = getMenuItems(menu);
    if (!items.length) return;
    const currentIndex = items.indexOf(getMenuActiveElement(menu));
    let nextIndex;

    switch (event.key) {
      case "ArrowDown":
        nextIndex = disableListWrap
          ? Math.min(currentIndex + 1, items.length - 1)
          : (currentIndex + 1) % items.length;
        break;
      case "ArrowUp":
        nextIndex = disableListWrap
          ? Math.max(currentIndex - 1, 0)
          : currentIndex <= 0
            ? items.length - 1
            : currentIndex - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
      default: {
        // Space activates a menu item instead of joining the search prefix.
        if (event.key.length !== 1 || event.key === " ") return;
        const now = Date.now();
        if (now - lastKeyTime > 500) prefix = "";
        lastKeyTime = now;
        prefix += event.key.toLocaleLowerCase();
        const repeating = [...prefix].every((key) => key === prefix[0]);
        const search = repeating ? prefix[0] : prefix;
        const startIndex = repeating
          ? currentIndex + 1
          : Math.max(currentIndex, 0);

        for (let offset = 0; offset < items.length; offset += 1) {
          const index = (startIndex + offset) % items.length;
          const label = (
            items[index].innerText ||
            items[index].textContent ||
            ""
          )
            .trim()
            .toLocaleLowerCase();
          if (label.startsWith(search)) {
            nextIndex = index;
            break;
          }
        }
        // An unmatched prefix must not reach MUI's document-based navigation.
        event.stopPropagation();
        if (nextIndex === undefined) return;
      }
    }

    event.preventDefault();
    event.stopPropagation();
    items[nextIndex].focus();
  };
}
