(() => {
  const sides = [4, 6, 8, 10, 12, 20, 100];
  const symbols = { 4: '△', 6: '◆', 8: '◇', 10: '◈', 12: '⬟', 20: '⬢', 100: '◉' };
  const selected = new Map();
  let rolling = false;
  let lastRoll = null;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const totalDice = () => [...selected.values()].reduce((sum, amount) => sum + amount, 0);
  const notation = (quantity, die, modifier = 0) => `${quantity}d${die}${modifier ? modifier > 0 ? `+${modifier}` : modifier : ''}`;
  const randomDie = die => Math.floor(Math.random() * die) + 1;
  function setRollingBoxCollapsed(collapsed) { const arena = $('.dice-arena'), button = $('#toggle-dice-arena'); if (!arena || !button) return; arena.classList.toggle('rolling-box-hidden', collapsed); button.textContent = collapsed ? '▸' : '▾'; button.title = collapsed ? 'Mostrar mesa de rolagem' : 'Ocultar mesa de rolagem'; button.setAttribute('aria-label', button.title); button.setAttribute('aria-expanded', String(!collapsed)); }

  function setArenaState(state) {
    const arena = $('.dice-arena');
    const dock = $('.bottom-dock');
    document.body.dataset.diceArena = state;
    arena?.classList.remove('is-expanded');
    dock?.classList.remove('dice-expanded');
  }

  function render() {
    const total = totalDice();
    $$('.arena-die').forEach(button => {
      const amount = selected.get(+button.dataset.dice) || 0;
      const count = button.querySelector('b');
      button.classList.toggle('selected', amount > 0);
      button.setAttribute('aria-pressed', String(amount > 0));
      count.hidden = !amount;
      count.textContent = amount;
    });
    $('#roll-selected').disabled = rolling || !total;
    $('#clear-dice').disabled = rolling || (!total && !lastRoll);
    renderResults();
  }

  function renderResults() {
    // O resultado fica somente no rodapé da caixa fixa de rolagem.
  }

  function clear() {
    if (rolling) return;
    selected.clear();
    lastRoll = null;
    window.Dice3DRoller?.clear();
    $('#roll-result').textContent = 'Pronto para rolar';
    $('#roll-log').textContent = 'Selecione os dados acima.';
    setArenaState('compact');
    render();
  }

  function addDie(die) {
    if (rolling || totalDice() >= 30) return;
    selected.set(die, (selected.get(die) || 0) + 1);
    render();
  }

  async function runRoll(entries, modifier = 0) {
    if (rolling || !entries.length) return;
    setRollingBoxCollapsed(false);
    rolling = true;
    lastRoll = null;
    window.Dice3DRoller?.clear();
    setArenaState('rolling');
    render();
    $$('.dice-arena button, .dice-arena input').forEach(control => { control.disabled = true; });
    const expression = entries.map(([die, quantity]) => notation(quantity, die)).join(' + ');
    $('#roll-result').textContent = `Rolando ${expression}${modifier ? ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}` : ''}`;
    $('#roll-log').textContent = 'Os dados estão na arena…';
    try {
      const rolls = entries.every(([die]) => sides.includes(die))
        ? await window.Dice3DRoller?.rollMany(entries.map(([die, quantity]) => notation(quantity, die)))
        : null;
      const values = rolls?.map(roll => Number(roll.value)).filter(Number.isFinite);
      if (!values?.length) throw Error('Rolagem 3D indisponível');
      const total = values.reduce((sum, value) => sum + value, modifier);
      let cursor = 0;
      const details = entries.map(([die, quantity]) => `d${die} [${values.slice(cursor, cursor += quantity).join(', ')}]`);
      cursor = 0;
      lastRoll = {
        total,
        expression: `${expression}${modifier ? modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}` : ''}`,
        dice: entries.flatMap(([die, quantity]) => values.slice(cursor, cursor += quantity).map(value => ({ die, value }))),
      };
      $('#roll-result').textContent = `TOTAL ${total}`;
      $('#roll-log').textContent = `${details.join(' + ')}${modifier ? ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}` : ''}`;
    } catch (error) {
      console.warn(error);
      const values = entries.flatMap(([die, quantity]) => Array.from({ length: quantity }, () => randomDie(die)));
      const total = values.reduce((sum, value) => sum + value, modifier);
      let cursor = 0;
      lastRoll = {
        total,
        expression: `${expression}${modifier ? modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}` : ''}`,
        dice: entries.flatMap(([die, quantity]) => values.slice(cursor, cursor += quantity).map(value => ({ die, value }))),
      };
      $('#roll-result').textContent = `TOTAL ${total}`;
      $('#roll-log').textContent = `${expression}: [${values.join(', ')}] · modo simples`;
    } finally {
      rolling = false;
      window.Dice3DRoller?.clear();
      setArenaState('compact');
      $$('.dice-arena button, .dice-arena input').forEach(control => { control.disabled = false; });
      render();
    }
  }

  function build() {
    const host = $('.dice-bar');
    if (!host) return;
    host.innerHTML = `<section class="dice-arena" aria-label="Arena de dados"><header class="dice-arena-controls"><div class="arena-inputs"><div class="arena-picker" aria-label="Dados disponíveis">${sides.map(die => `<button class="arena-die d${die}" data-dice="${die}" aria-pressed="false" title="Adicionar d${die}"><i>${symbols[die]}</i><span>d${die}</span><b hidden>0</b></button>`).join('')}</div><div class="arena-actions"><button id="roll-selected" class="gold-button" disabled>Jogar dados</button><button id="clear-dice" class="dark-button" disabled>Limpar</button></div></div><button type="button" id="toggle-dice-arena" class="arena-visibility-toggle" aria-expanded="true" aria-controls="dice-rolling-box" title="Ocultar mesa de rolagem">▾</button></header><section class="dice-rolling-box" id="dice-rolling-box" aria-label="Mesa de rolagem"><div class="dice-arena-stage"><div class="dice-tray" id="dice-tray" aria-label="Dados lançados"><section class="dice-3d-overlay" id="dice-3d-overlay" hidden aria-live="polite"><div id="dice-stage"></div></section></div></div><footer class="dice-arena-result"><strong id="roll-result">Pronto para rolar</strong><span id="roll-log">Selecione os dados acima.</span></footer></section></section>`;
    $$('.arena-die').forEach(button => button.addEventListener('click', () => addDie(+button.dataset.dice)));
    $('#roll-selected').addEventListener('click', () => runRoll([...selected.entries()]));
    $('#clear-dice').addEventListener('click', clear);
    $('#toggle-dice-arena').addEventListener('click',()=>setRollingBoxCollapsed(!$('.dice-arena')?.classList.contains('rolling-box-hidden')));
    setArenaState('compact');
    render();
  }

  build();
})();
