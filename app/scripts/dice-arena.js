(() => {
  const sides = [4, 6, 8, 10, 12, 20, 100];
  const symbols = { 4: '△', 6: '◆', 8: '◇', 10: '◈', 12: '⬟', 20: '⬢', 100: '◉' };
  const selected = new Map();
  let rolling = false;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const totalDice = () => [...selected.values()].reduce((sum, amount) => sum + amount, 0);
  const notation = (quantity, die, modifier = 0) => `${quantity}d${die}${modifier ? modifier > 0 ? `+${modifier}` : modifier : ''}`;
  const randomDie = die => Math.floor(Math.random() * die) + 1;

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
    $('#clear-dice').disabled = rolling || !total;
  }

  function clear() {
    if (rolling) return;
    selected.clear();
    window.Dice3DRoller?.clear();
    $('#roll-result').textContent = 'Pronto para rolar';
    $('#roll-log').textContent = 'Selecione os dados acima.';
    render();
  }

  function addDie(die) {
    if (rolling || totalDice() >= 30) return;
    selected.set(die, (selected.get(die) || 0) + 1);
    render();
  }

  async function runRoll(entries, modifier = 0) {
    if (rolling || !entries.length) return;
    rolling = true;
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
      $('#roll-result').textContent = `${total} · ${expression}${modifier ? modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}` : ''}`;
      $('#roll-log').textContent = `${details.join(' + ')}${modifier ? ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}` : ''}`;
    } catch (error) {
      console.warn(error);
      const values = entries.flatMap(([die, quantity]) => Array.from({ length: quantity }, () => randomDie(die)));
      const total = values.reduce((sum, value) => sum + value, modifier);
      $('#roll-result').textContent = `${total} · ${expression}`;
      $('#roll-log').textContent = `[${values.join(', ')}] · modo simples`;
    } finally {
      rolling = false;
      $$('.dice-arena button, .dice-arena input').forEach(control => { control.disabled = false; });
      render();
    }
  }

  function build() {
    const host = $('.dice-bar');
    if (!host) return;
    host.innerHTML = `<section class="dice-arena" aria-label="Arena de dados"><header class="dice-arena-controls"><div class="arena-picker" aria-label="Dados disponíveis">${sides.map(die => `<button class="arena-die d${die}" data-dice="${die}" aria-pressed="false" title="Adicionar d${die}"><i>${symbols[die]}</i><span>d${die}</span><b hidden>0</b></button>`).join('')}</div><div class="arena-actions"><button id="roll-selected" class="gold-button" disabled>Jogar dados</button><button id="clear-dice" class="dark-button" disabled>Limpar</button></div><form id="custom-roll" class="arena-custom" title="Rolagem personalizada"><input id="dice-quantity" type="number" min="1" max="30" value="1" aria-label="Quantidade" /><span>d</span><input id="dice-sides" type="number" min="2" max="1000" value="20" aria-label="Lados" /><span>+</span><input id="dice-modifier" type="number" value="0" aria-label="Modificador" /><button class="dark-button">Outra rolagem</button></form></header><div class="dice-arena-stage"><div class="dice-tray" id="dice-tray" aria-label="Dados lançados"><section class="dice-3d-overlay" id="dice-3d-overlay" hidden aria-live="polite"><div id="dice-stage"></div></section></div></div><footer class="dice-arena-result"><strong id="roll-result">Pronto para rolar</strong><span id="roll-log">Selecione os dados acima.</span></footer></section>`;
    $$('.arena-die').forEach(button => button.addEventListener('click', () => addDie(+button.dataset.dice)));
    $('#roll-selected').addEventListener('click', () => runRoll([...selected.entries()]));
    $('#clear-dice').addEventListener('click', clear);
    $('#custom-roll').addEventListener('submit', event => {
      event.preventDefault();
      const quantity = Math.max(1, Math.min(30, +$('#dice-quantity').value || 1));
      const die = Math.max(2, Math.min(1000, +$('#dice-sides').value || 20));
      runRoll([[die, quantity]], Number($('#dice-modifier').value) || 0);
    });
    render();
  }

  build();
})();
