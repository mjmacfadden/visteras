/** Option/Alt freezes the incoming handle while the outgoing handle follows the pointer. */
export function penHandles(anchor, pointer, incoming, independent) {
  return {
    outgoing: { ...pointer },
    incoming: independent ? { ...(incoming || anchor) } : {
      x: 2 * anchor.x - pointer.x, y: 2 * anchor.y - pointer.y,
    },
  };
}
