let box;
let started;
let tableBounds = null;
let stageSize = '';
let diceOnTable = false;

function stageLayout() {
  const overlay = document.querySelector('#dice-3d-overlay');
  if (!overlay || !tableBounds?.points?.length) return null;
  const overlayRect = overlay.getBoundingClientRect();
  const center = tableBounds.points.reduce((sum, point) => ({ x: sum.x + point.x / tableBounds.points.length, y: sum.y + point.y / tableBounds.points.length }), { x: 0, y: 0 });
  const safePoints = tableBounds.points.map(point => ({ x: center.x + (point.x - center.x) * .84 - overlayRect.left, y: center.y + (point.y - center.y) * .78 - overlayRect.top }));
  const xs = safePoints.map(point => point.x), ys = safePoints.map(point => point.y);
  const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
  const width = Math.max(1, right - left), height = Math.max(1, bottom - top);
  return { left, top, width, height, clip: safePoints.map(point => `${((point.x - left) / width * 100).toFixed(3)}% ${((point.y - top) / height * 100).toFixed(3)}%`).join(',') };
}

function applyTableBounds({ resize = false } = {}) {
  const stage = document.querySelector('#dice-stage');
  const layout = stageLayout();
  if (!stage || !layout) return;
  const { left, top, width, height, clip } = layout;
  stage.style.left = `${left}px`;
  stage.style.top = `${top}px`;
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.clipPath = clip ? `polygon(${clip})` : '';
  const nextSize = `${Math.round(width)}x${Math.round(height)}`;
  if (resize && box && !diceOnTable && nextSize !== stageSize) box.resizeWorld();
  stageSize = nextSize;
}

async function prepare() {
  if (box) return box;
  if (started) return started;
  started = (async () => {
    const { default: DiceBox } = await import('../vendor/dice-box/dice-box.es.js');
    box = new DiceBox({
      container: '#dice-stage',
      assetPath: '/vendor/dice-box/assets/',
      theme: 'default',
      themeColor: '#d5a45d',
      enableShadows: true,
      shadowTransparency: 0.65,
      lightIntensity: 1.15,
      scale: 2.8,
      delay: 48,
      offscreen: false,
    });
    await box.init();
    return box;
  })();
  try { return await started; }
  catch (error) { started = null; box = null; throw error; }
}

window.Dice3DRoller = {
  async roll(notation) {
    const overlay = document.querySelector('#dice-3d-overlay');
    tableBounds = window.__tabletopBoardBounds || tableBounds;
    diceOnTable = false;
    overlay.hidden = false;
    await new Promise(resolve => requestAnimationFrame(resolve));
    applyTableBounds({ resize: true });
    try {
      const dice = await prepare();
      diceOnTable = true;
      return await dice.roll(notation);
    } catch (error) {
      overlay.hidden = true;
      diceOnTable = false;
      throw error;
    }
  },
  async rollMany(notations) {
    const overlay = document.querySelector('#dice-3d-overlay');
    tableBounds = window.__tabletopBoardBounds || tableBounds;
    diceOnTable = false;
    overlay.hidden = false;
    await new Promise(resolve => requestAnimationFrame(resolve));
    applyTableBounds({ resize: true });
    try {
      const dice = await prepare();
      diceOnTable = true;
      const launches = notations.map((notation, index) => index === 0 ? dice.roll(notation) : dice.add(notation, { newStartPoint: false }));
      return (await Promise.all(launches)).flat();
    } catch (error) {
      overlay.hidden = true;
      diceOnTable = false;
      throw error;
    }
  },
  clear() {
    if (box) box.clear();
    diceOnTable = false;
    document.querySelector('#dice-3d-overlay').hidden = true;
  },
  setTableBounds(bounds) {
    tableBounds = bounds;
    applyTableBounds({ resize: !diceOnTable });
  }
};
