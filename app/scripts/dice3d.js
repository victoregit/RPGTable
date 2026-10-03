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
      scale: 4.4,
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
    overlay.hidden = false;
    await new Promise(resolve => requestAnimationFrame(resolve));
    try {
      const dice = await prepare();
      const result = await dice.roll(notation);
      window.setTimeout(() => { overlay.hidden = true; }, 1050);
      return result;
    } catch (error) {
      overlay.hidden = true;
      throw error;
    }
  }
};
