/** Reuse Smart Guides for a dragged anchor in document coordinates. */
export function anchorGuideSnap(manager, point, elements, dir = 'ne') {
  const result = manager?.evaluateHandleSnap?.({ dir, p: point, elements });
  if (!result) return null;
  return { contentPt: { x: result.snappedX, y: result.snappedY } };
}
