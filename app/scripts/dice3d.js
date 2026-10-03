let box;
let started;
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
      scale: 2.35,
      delay: 42,
      offscreen: false,
    });
    await box.init();
    return box;
  })();
  try { return await started; }
  catch (error) { started = null; box = null; throw error; }
}

function mountTray() {
  const overlay = document.querySelector('#dice-3d-overlay');
  const output = document.querySelector('.roll-output');
  if (!overlay || !output) return overlay;
  let tray = document.querySelector('#dice-tray');
  if (!tray) {
    tray = document.createElement('div');
    tray.id = 'dice-tray';
    tray.className = 'dice-tray';
    tray.setAttribute('aria-label', 'Bandeja de rolagem');
    output.prepend(tray);
  }
  if (overlay.parentElement !== tray) tray.append(overlay);
  return overlay;
}

async function startRoll() {
  const overlay = mountTray();
  if (!overlay) throw Error('Bandeja de rolagem indisponível');
  overlay.hidden = false;
  await new Promise(resolve => requestAnimationFrame(resolve));
  return prepare();
}

window.Dice3DRoller = {
  async roll(notation) {
    try { return await (await startRoll()).roll(notation); }
    catch (error) { document.querySelector('#dice-3d-overlay').hidden = true; throw error; }
  },
  async rollMany(notations) {
    try {
      const dice = await startRoll();
      const launches = notations.map((notation, index) => index === 0 ? dice.roll(notation) : dice.add(notation, { newStartPoint: false }));
      return (await Promise.all(launches)).flat();
    } catch (error) {
      document.querySelector('#dice-3d-overlay').hidden = true;
      throw error;
    }
  },
  clear() {
    if (box) box.clear();
    document.querySelector('#dice-3d-overlay').hidden = true;
  }
};
