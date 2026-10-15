/**
 * Visteras Vector — envelopes in exports and the clipboard: only the rendered `-out` leaves the
 * editor. `-src` and every data-visteras-envelope* attribute are removed. Pure DOM walk, no globals.
 */
const ENV = 'data-visteras-envelope';
const SRC = `${ENV}-src`;

/** Strip envelopes inside (or at) `root` down to their output. Returns the number of envelopes handled. */
export function envelopeOutputOnly(root) {
  if (!root) return 0;
  const envs = [root, ...(root.querySelectorAll?.('*') || [])].filter((n) => n.getAttribute?.(ENV) === 'warp');
  let n = 0;
  for (const env of envs) {
    for (const child of [...(env.children || [])]) if (child.hasAttribute?.(SRC)) child.remove();
    n++;
  }
  for (const node of [root, ...(root.querySelectorAll?.('*') || [])]) {
    for (const a of [...(node.attributes || [])]) if (a.name.startsWith(ENV)) node.removeAttribute(a.name);
  }
  return n;
}
