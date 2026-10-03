let box;
let started;
let tableBounds = null;
let stageSize = '';
let diceOnTable = false;

function applyTableBounds({ resize = false } = {}) {
  const stage = document.querySelector('#dice-stage');
  if (!stage || !tableBounds) return;
  const { left, top, width, height, clip } = tableBounds;
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
      scale: 3.25,
      delay: 65,
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
    applyTableBounds();
    overlay.hidden = false;
    await new Promise(resolve => requestAnimationFrame(resolve));
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
    applyTableBounds();
    overlay.hidden = false;
    await new Promise(resolve => requestAnimationFrame(resolve));
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
    applyTableBounds({ resize: true });
  }
};
