/** Download an already prepared PNG without requesting extension permissions. */
export function downloadImageBlob(blob, source = "image") {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kiss-${source}-${Date.now()}.png`;
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Allow the browser to consume the URL before releasing the image bytes.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
