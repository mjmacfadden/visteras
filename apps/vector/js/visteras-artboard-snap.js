/** Find a finite artboard edge/corner within a screen-pixel magnetic radius. */
export function snapToArtboard(pointer, board, matrix, radius = 8) {
  if (!board || !matrix || !(board.width > 0 && board.height > 0)) return null;
  const corners = [
    { x: board.x, y: board.y }, { x: board.x + board.width, y: board.y },
    { x: board.x + board.width, y: board.y + board.height }, { x: board.x, y: board.y + board.height },
  ];
  const screen = p => ({ x: matrix.a*p.x + matrix.c*p.y + matrix.e, y: matrix.b*p.x + matrix.d*p.y + matrix.f });
  const targets = corners.map(contentPt => {
    const screenPt = screen(contentPt);
    return { contentPt, screenPt, dist: Math.hypot(pointer.x-screenPt.x, pointer.y-screenPt.y) };
  });
  // Capture both axes together when close to a corner.
  const corner = targets.filter(p => p.dist <= radius).sort((a,b) => a.dist-b.dist)[0];
  if (corner) return corner;
  let nearest = null;
  for (let i = 0; i < 4; i++) {
    const a = targets[i], b = targets[(i+1)%4];
    const dx = b.screenPt.x-a.screenPt.x, dy = b.screenPt.y-a.screenPt.y;
    const length2 = dx*dx + dy*dy;
    if (!length2) continue;
    const t = Math.max(0, Math.min(1, ((pointer.x-a.screenPt.x)*dx+(pointer.y-a.screenPt.y)*dy)/length2));
    const screenPt = { x:a.screenPt.x+t*dx, y:a.screenPt.y+t*dy };
    const dist = Math.hypot(pointer.x-screenPt.x, pointer.y-screenPt.y);
    if (dist <= radius && (!nearest || dist < nearest.dist)) nearest = { screenPt, dist,
      contentPt: { x:a.contentPt.x+t*(b.contentPt.x-a.contentPt.x), y:a.contentPt.y+t*(b.contentPt.y-a.contentPt.y) } };
  }
  return nearest;
}

export function artboardSnapTarget(sc, pointer) {
  const resolution = sc.getResolution();
  const board = window.__visterasArtboards?.active() || { x:0, y:0, width:Number(resolution.w), height:Number(resolution.h) };
  return snapToArtboard(pointer, board, sc.getSvgContent().getScreenCTM());
}
