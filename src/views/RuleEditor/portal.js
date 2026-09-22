// Keep popups inside the editor's palette and shadow-tree style boundary.
export function getEditorPortalContainer(element) {
  return (
    element?.closest(".kt-m3-root") ||
    element?.closest(".notranslate") ||
    element?.ownerDocument?.body ||
    document.body
  );
}
