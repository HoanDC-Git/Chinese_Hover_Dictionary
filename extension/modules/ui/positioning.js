// Position popup near hovered character center and do boundary checks
function positionPopup() {
  if (!popupElement) return;

  // Temporarily show popup to compute width/height
  popupElement.style.visibility = "hidden";
  popupElement.style.display = "flex";
  popupElement.classList.add("zh-visible");

  const popupWidth = popupElement.offsetWidth || 300;
  const popupHeight = popupElement.offsetHeight || 150;

  popupElement.style.display = "";
  popupElement.style.visibility = "";

  let left, top;

  if (hoveredCharRects && hoveredCharRects.length > 0) {
    const rect = hoveredCharRects[0];
    // With position: fixed, we use viewport coordinates directly
    const charTop = rect.top;
    const charBottom = rect.bottom;
    const charLeft = rect.left;
    const charRight = rect.right;

    const offset = 4; // Distance between popup and character top/bottom edge

    // Check if popup fits below character bottom in the viewport
    const viewportBottom = window.innerHeight;
    const fitBelow = rect.bottom + offset + popupHeight <= viewportBottom - 10;

    if (fitBelow) {
      // Normal: Top edge of popup is slightly below bottom edge of character
      top = charBottom + offset;
    } else {
      // Near viewport bottom: Bottom edge of popup is slightly above top edge of character
      top = charTop - offset - popupHeight;
    }

    // Position horizontally: prefer right, fallback to left if it overflows viewport right margin
    const viewportRight = charRight;
    if (viewportRight + 10 + popupWidth <= window.innerWidth) {
      // Place completely to the right of the character
      left = charRight - 8;
    } else {
      // Place completely to the left of the character
      left = charLeft - popupWidth - 4;
    }
  } else {
    // Fallback to mouse coordinates if character rect is not available
    left = targetX + 15;
    top = targetY - popupHeight / 2;
  }

  // Prevent popup from extending beyond viewport left/right edges
  const minLeft = 10;
  const maxLeft = window.innerWidth - popupWidth - 10;

  if (left < minLeft) left = minLeft;
  if (left > maxLeft) left = maxLeft;

  // Prevent popup from extending beyond viewport top/bottom edges
  const minTop = 10;
  const maxTop = window.innerHeight - popupHeight - 10;

  if (top < minTop) top = minTop;
  if (top > maxTop) top = maxTop;

  popupElement.style.left = `${left}px`;
  popupElement.style.top = `${top}px`;
  popupElement.classList.add("zh-visible");

  // Remove focus from input elements to remove typing caret when popup appears
  if (
    document.activeElement &&
    (document.activeElement.tagName === "INPUT" ||
      document.activeElement.tagName === "TEXTAREA" ||
      document.activeElement.isContentEditable)
  ) {
    document.activeElement.blur();
  }
}

