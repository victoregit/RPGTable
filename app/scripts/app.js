(() => {
  'use strict';

  const DB_NAME = 'central-campanha-rpg';
  const STORE = 'app';
  const CATEGORY_ORDER = ['Todos', 'Fichas', 'Handouts', 'Históricos', 'Mapas', 'Músicas', 'Tokens'];
  const CATEGORY_INFO = {
    Fichas: ['fichas de personagem', 'fichas'],
    Handouts: ['handouts'],
    Históricos: ['historicos de personagem', 'históricos de personagem', 'historicos'],
    Mapas: ['mapas'],
    Músicas: ['musicas', 'músicas'],
    Tokens: ['tokens'],
  };
  const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp']);
  const audioExtensions = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']);
  const state = {
    campaignName: '', assets: [], notes: {}, active: emptySession(), history: [], selectedAsset: null, category: 'Todos', search: '', mapTool: 'pan', resumed: false,
  };
  const files = new Map();
  const urls = new Map();
  let directoryHandle = null;
  let currentMapId = null;
  let saveTimer = null;
  let drawing = null;
  let panning = null;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function emptySession() {
    return { id: crypto.randomUUID(), startedAt: new Date().toISOString(), updatedAt: null, notes: '', initiative: [], round: 1, scenes: {}, currentMap: null, music: { id: '', time: 0, volume: 0.7, playing: false } };
  }
  function createId(prefix = 'id') { return `${prefix}-${crypto.randomUUID()}`; }
  function safeClone(value) { return JSON.parse(JSON.stringify(value)); }
  function norm(text = '') { return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function extension(name) { return name.split('.').pop().toLowerCase(); }
  function fileType(name) { const ext = extension(name); if (imageExtensions.has(ext)) return 'imagem'; if (audioExtensions.has(ext)) return 'áudio'; if (ext === 'pdf') return 'pdf'; return 'arquivo'; }
  function categoryFor(path) { const first = norm(path.split('/')[0]); return Object.entries(CATEGORY_INFO).find(([, names]) => names.includes(first))?.[0] || 'Outros'; }
  function prettyDate(date) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)); }
  function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function dbGet(key) { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  async function dbSet(key, value) { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }

  async function boot() {
    try {
      const saved = await dbGet('state');
      if (saved) Object.assign(state, saved, { resumed: false });
      directoryHandle = await dbGet('directoryHandle') || null;
      if (directoryHandle && await verifyPermission(directoryHandle, false)) await scanDirectory(directoryHandle, false);
      if ('storage' in navigator && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (error) { console.warn('Não foi possível ler o salvamento local.', error); }
    bindEvents(); renderAll();
    if (state.active?.updatedAt && !state.resumed) $('#resume-dialog').showModal();
  }
  async function verifyPermission(handle, write) {
    const options = { mode: write ? 'readwrite' : 'read' };
    return (await handle.queryPermission(options)) === 'granted' || (await handle.requestPermission(options)) === 'granted';
  }
  function queueSave() {
    $('#save-status').textContent = 'Salvando…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      state.active.updatedAt = new Date().toISOString();
      try { await dbSet('state', safeClone(state)); $('#save-status').textContent = 'Salvo'; } catch { $('#save-status').textContent = 'Erro ao salvar'; }
    }, 350);
  }
  async function chooseFolder() {
    try {
      if (!window.showDirectoryPicker) { alert('Use o Microsoft Edge ou Google Chrome para selecionar a pasta completa da campanha.'); return; }
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      directoryHandle = handle;
      await dbSet('directoryHandle', handle);
      await scanDirectory(handle, true);
    } catch (error) { if (error.name !== 'AbortError') alert('Não foi possível importar a pasta.'); }
  }
  async function scanDirectory(handle, notify = true) {
    const imported = [];
    files.clear(); urls.forEach(url => URL.revokeObjectURL(url)); urls.clear();
    async function visit(folder, prefix = '') {
      for await (const entry of folder.values()) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.kind === 'directory') await visit(entry, path);
        else {
          const category = categoryFor(path);
          if (category !== 'Outros' && fileType(entry.name) !== 'arquivo') {
            const asset = { id: `asset:${path}`, path, name: entry.name, category, type: fileType(entry.name) };
            imported.push(asset); files.set(asset.id, entry);
          }
        }
      }
    }
    await visit(handle);
    state.campaignName = handle.name;
    state.assets = imported.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, 'pt-BR'));
    if (state.selectedAsset && !files.has(state.selectedAsset)) state.selectedAsset = null;
    queueSave(); renderAll();
    if (notify) { $('#folder-name').textContent = `${imported.length} materiais em ${handle.name}`; }
  }
  async function fileFor(assetId) {
    if (!files.has(assetId) && directoryHandle && await verifyPermission(directoryHandle, false)) await scanDirectory(directoryHandle, false);
    const entry = files.get(assetId); return entry ? entry.getFile() : null;
  }
  async function urlFor(asset) {
    if (!asset) return null;
    if (urls.has(asset.id)) return urls.get(asset.id);
    const file = await fileFor(asset.id); if (!file) return null;
    const url = URL.createObjectURL(file); urls.set(asset.id, url); return url;
  }

  function bindEvents() {
    $('#choose-folder').addEventListener('click', chooseFolder); $$('.choose-folder-copy').forEach(button => button.addEventListener('click', chooseFolder));
    $$('.nav-item').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
    $('#search-input').addEventListener('input', event => { state.search = event.target.value; renderLibrary(); });
    $('#map-select').addEventListener('change', event => openMap(event.target.value));
    $$('.tool-button[data-map-tool]').forEach(button => button.addEventListener('click', () => { state.mapTool = button.dataset.mapTool; $$('.tool-button[data-map-tool]').forEach(item => item.classList.toggle('active', item === button)); $('#map-stage').classList.toggle('drawing', state.mapTool === 'draw'); }));
    $('#add-marker').addEventListener('click', () => addMarker()); $('#zoom-in').addEventListener('click', () => zoomMap(.15)); $('#zoom-out').addEventListener('click', () => zoomMap(-.15)); $('#zoom-reset').addEventListener('click', () => resetMapView());
    $('#map-viewport').addEventListener('dragover', event => event.preventDefault()); $('#map-viewport').addEventListener('drop', event => { event.preventDefault(); const id = event.dataTransfer.getData('text/token'); if (id) addToken(id, event.clientX, event.clientY); });
    $('#map-stage').addEventListener('pointerdown', startMapPointer);
    $('#session-notes').addEventListener('input', event => { state.active.notes = event.target.value; queueSave(); });
    $('#add-initiative').addEventListener('click', addInitiative); $('#initiative-name').addEventListener('keydown', event => { if (event.key === 'Enter') addInitiative(); }); $('#next-round').addEventListener('click', () => { state.active.round += 1; renderInitiative(); queueSave(); }); $('#previous-round').addEventListener('click', () => { state.active.round = Math.max(1, state.active.round - 1); renderInitiative(); queueSave(); });
    $$('.dice-shortcuts button').forEach(button => button.addEventListener('click', () => rollDice(1, Number(button.dataset.dice), 0)));
    $('#custom-roll').addEventListener('submit', event => { event.preventDefault(); rollDice(Number($('#dice-quantity').value), Number($('#dice-sides').value), Number($('#dice-modifier').value)); }); $('#clear-rolls').addEventListener('click', () => { $('#roll-log').innerHTML = ''; $('#roll-result').textContent = 'Pronto para rolar.'; });
    $('#music-select').addEventListener('change', event => setMusic(event.target.value)); $('#audio-player').addEventListener('timeupdate', () => { state.active.music.time = $('#audio-player').currentTime; if (Math.floor($('#audio-player').currentTime) % 5 === 0) queueSave(); }); $('#audio-player').addEventListener('play', () => { state.active.music.playing = true; $('#music-status').textContent = 'Tocando'; queueSave(); }); $('#audio-player').addEventListener('pause', () => { state.active.music.playing = false; $('#music-status').textContent = 'Pausada'; queueSave(); }); $('#volume-range').addEventListener('input', event => { state.active.music.volume = Number(event.target.value); $('#audio-player').volume = state.active.music.volume; queueSave(); });
    $('#new-session').addEventListener('click', () => { if (!state.active.updatedAt || confirm('Começar uma nova sessão? O estado atual continuará salvo somente se você o registrar no histórico.')) beginNewSession(); }); $('#resume-button').addEventListener('click', () => $('#resume-dialog').showModal());
    $('#resume-dialog').addEventListener('close', () => { if ($('#resume-dialog').returnValue === 'confirm') { state.resumed = true; restoreActive(); } else if ($('#resume-dialog').returnValue === 'cancel') beginNewSession(); });
    $('#end-session').addEventListener('click', () => $('#end-dialog').showModal()); $('#cancel-end').addEventListener('click', () => $('#end-dialog').close()); $('#end-form').addEventListener('submit', endSession);
  }
  function showView(name) {
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === name)); $$('.view').forEach(view => view.classList.toggle('active', view.id === name));
    const titles = { biblioteca: ['MATERIAIS DA CAMPANHA', 'Biblioteca'], mapa: ['CENA ATUAL', 'Mapa'], sessao: ['CONTROLE DO MESTRE', 'Sessão'], historico: ['REGISTROS DA CAMPANHA', 'Histórico'] }; $('#view-eyebrow').textContent = titles[name][0]; $('#view-title').textContent = titles[name][1];
    if (name === 'mapa') renderMap(); if (name === 'historico') renderHistory();
  }
  function renderAll() { renderFolder(); renderCategories(); renderLibrary(); renderAssetPanel(); renderMapOptions(); renderMap(); renderSession(); renderHistory(); }
  function renderFolder() { $('#folder-name').textContent = state.campaignName ? `${state.assets.length} materiais em ${state.campaignName}` : 'Nenhuma campanha importada'; }
  function renderCategories() { $('#category-tabs').innerHTML = CATEGORY_ORDER.map(category => `<button class="category-tab ${state.category === category ? 'active' : ''}" data-category="${category}">${category}</button>`).join(''); $$('.category-tab').forEach(button => button.addEventListener('click', () => { state.category = button.dataset.category; renderCategories(); renderLibrary(); })); }
  function filteredAssets() { const term = norm(state.search); return state.assets.filter(asset => (state.category === 'Todos' || asset.category === state.category) && (!term || norm(`${asset.name} ${asset.path}`).includes(term))); }
  function renderLibrary() {
    const assets = filteredAssets(); const grid = $('#asset-grid'); grid.innerHTML = '';
    assets.forEach(asset => { const button = document.createElement('button'); button.className = `asset-card ${state.selectedAsset === asset.id ? 'selected' : ''}`; button.innerHTML = `<div class="asset-thumb" data-thumb="${asset.id}"><span class="file-symbol">${asset.type === 'pdf' ? '▤' : asset.type === 'áudio' ? '♫' : '◈'}</span></div><div class="asset-card-text"><div class="asset-card-title">${escapeHtml(asset.name)}</div><div class="asset-card-meta">${asset.category} · ${asset.type}</div></div>`; button.addEventListener('click', () => { state.selectedAsset = asset.id; renderLibrary(); renderAssetPanel(); }); grid.append(button); loadThumbnail(asset, button.querySelector('[data-thumb]')); });
    $('#empty-library').classList.toggle('visible', !state.assets.length); if (!state.assets.length) grid.style.display = 'none'; else grid.style.display = 'grid';
  }
  async function loadThumbnail(asset, target) { if (asset.type !== 'imagem') return; const url = await urlFor(asset); if (url && target?.isConnected) target.innerHTML = `<img alt="" src="${url}" />`; }
  async function renderAssetPanel() {
    const asset = state.assets.find(item => item.id === state.selectedAsset); const panel = $('#asset-panel');
    if (!asset) { panel.innerHTML = '<div class="panel-placeholder"><span>◈</span><p>Selecione um material<br />para visualizar.</p></div>'; return; }
    panel.innerHTML = `<div class="asset-detail"><p class="eyebrow">${asset.category.toUpperCase()}</p><h2>${escapeHtml(asset.name)}</h2><div id="detail-media" class="detail-preview">Carregando…</div><div class="detail-actions"><button id="open-file" class="small-button">Abrir em nova aba</button>${asset.category === 'Mapas' && asset.type === 'imagem' ? '<button id="use-map" class="primary-button">Usar no mapa</button>' : ''}</div><label class="note-label" for="asset-note">NOTAS DO MESTRE</label><textarea id="asset-note" class="asset-note" placeholder="Observações privadas sobre este material..."></textarea></div>`;
    const note = $('#asset-note'); note.value = state.notes[asset.id] || ''; note.addEventListener('input', () => { state.notes[asset.id] = note.value; queueSave(); }); $('#open-file').addEventListener('click', async () => { const url = await urlFor(asset); if (url) window.open(url, '_blank', 'noopener'); }); $('#use-map')?.addEventListener('click', () => { $('#map-select').value = asset.id; openMap(asset.id); showView('mapa'); });
    const url = await urlFor(asset); const media = $('#detail-media'); if (!url || !media) { if (media) media.textContent = 'Selecione a pasta da campanha para abrir este arquivo.'; return; }
    if (asset.type === 'imagem') media.outerHTML = `<img id="detail-media" class="detail-preview" src="${url}" alt="${escapeHtml(asset.name)}" />`; else if (asset.type === 'pdf') media.outerHTML = `<iframe id="detail-media" class="detail-preview pdf" title="${escapeHtml(asset.name)}" src="${url}"></iframe>`; else media.outerHTML = `<audio id="detail-media" class="detail-preview" controls src="${url}"></audio>`;
  }

  function renderMapOptions() { const select = $('#map-select'); const selected = state.active.currentMap || ''; select.innerHTML = '<option value="">Escolha um mapa da biblioteca</option>' + state.assets.filter(asset => asset.category === 'Mapas' && asset.type === 'imagem').map(asset => `<option value="${asset.id}">${escapeHtml(asset.name)}</option>`).join(''); select.value = selected; $('#token-list').innerHTML = ''; const tokens = state.assets.filter(asset => asset.category === 'Tokens' && asset.type === 'imagem'); $('#token-count').textContent = tokens.length; tokens.forEach(asset => { const button = document.createElement('button'); button.className = 'token'; button.draggable = true; button.title = asset.name; button.innerHTML = '<span class="file-symbol">◈</span>'; button.addEventListener('dragstart', event => event.dataTransfer.setData('text/token', asset.id)); button.addEventListener('click', () => addToken(asset.id)); $('#token-list').append(button); loadThumbnail(asset, button); }); }
  async function openMap(assetId) { state.active.currentMap = assetId || null; currentMapId = assetId || null; if (assetId && !state.active.scenes[assetId]) state.active.scenes[assetId] = { panX: 0, panY: 0, scale: 1, markers: [], strokes: [] }; queueSave(); renderMap(); }
  function scene() { return currentMapId ? state.active.scenes[currentMapId] : null; }
  async function renderMap() {
    currentMapId = state.active.currentMap; $('#map-select').value = currentMapId || ''; const asset = state.assets.find(item => item.id === currentMapId); const empty = $('#map-empty'); const stage = $('#map-stage'); if (!asset) { empty.hidden = false; stage.hidden = true; return; }
    const url = await urlFor(asset); if (!url) { empty.hidden = false; empty.innerHTML = '<span>!</span><h2>Reconecte a pasta da campanha</h2><p>O mapa não está acessível neste navegador.</p>'; stage.hidden = true; return; }
    empty.hidden = true; stage.hidden = false; const image = $('#map-image'); image.onload = () => { const width = image.naturalWidth; const height = image.naturalHeight; stage.style.width = `${width}px`; stage.style.height = `${height}px`; prepareCanvas(width, height); renderScene(); }; image.src = url; renderScene();
  }
  function renderScene() { const activeScene = scene(); if (!activeScene) return; const stage = $('#map-stage'); stage.style.left = `calc(50% + ${activeScene.panX}px)`; stage.style.top = `calc(50% + ${activeScene.panY}px)`; stage.style.transform = `translate(-50%, -50%) scale(${activeScene.scale})`; $('#zoom-reset').textContent = `${Math.round(activeScene.scale * 100)}%`; renderMarkers(); redrawCanvas(); }
  function prepareCanvas(width, height) { const canvas = $('#draw-canvas'); canvas.width = width; canvas.height = height; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; redrawCanvas(); }
  function redrawCanvas() { const current = scene(); const canvas = $('#draw-canvas'); if (!current || !canvas.width) return; const context = canvas.getContext('2d'); context.clearRect(0, 0, canvas.width, canvas.height); context.lineJoin = 'round'; context.lineCap = 'round'; current.strokes.forEach(stroke => { if (stroke.points.length < 2) return; context.strokeStyle = stroke.color; context.lineWidth = stroke.width; context.beginPath(); stroke.points.forEach((point, index) => { const x = point.x * canvas.width; const y = point.y * canvas.height; if (index) context.lineTo(x, y); else context.moveTo(x, y); }); context.stroke(); }); }
  function stagePoint(clientX, clientY) { const rect = $('#map-stage').getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) }; }
  function startMapPointer(event) { if (event.target.closest('.marker') || !scene()) return; const activeScene = scene(); if (state.mapTool === 'draw') { drawing = { pointer: event.pointerId, stroke: { id: createId('stroke'), color: '#e5b86d', width: 7 / activeScene.scale, points: [stagePoint(event.clientX, event.clientY)] } }; activeScene.strokes.push(drawing.stroke); event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.addEventListener('pointermove', mapPointerMove); event.currentTarget.addEventListener('pointerup', mapPointerEnd, { once: true }); redrawCanvas(); }
    else { panning = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, panX: activeScene.panX, panY: activeScene.panY }; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.addEventListener('pointermove', mapPointerMove); event.currentTarget.addEventListener('pointerup', mapPointerEnd, { once: true }); }
  }
  function mapPointerMove(event) { if (drawing && event.pointerId === drawing.pointer) { drawing.stroke.points.push(stagePoint(event.clientX, event.clientY)); redrawCanvas(); } if (panning && event.pointerId === panning.pointer) { const activeScene = scene(); activeScene.panX = panning.panX + event.clientX - panning.startX; activeScene.panY = panning.panY + event.clientY - panning.startY; renderScene(); } }
  function mapPointerEnd(event) { event.currentTarget.removeEventListener('pointermove', mapPointerMove); if (drawing && event.pointerId === drawing.pointer) drawing = null; if (panning && event.pointerId === panning.pointer) panning = null; queueSave(); }
  function zoomMap(amount) { const activeScene = scene(); if (!activeScene) return; activeScene.scale = Math.max(.25, Math.min(3, Math.round((activeScene.scale + amount) * 100) / 100)); renderScene(); queueSave(); }
  function resetMapView() { const activeScene = scene(); if (!activeScene) return; Object.assign(activeScene, { panX: 0, panY: 0, scale: 1 }); renderScene(); queueSave(); }
  function addMarker(tokenId, clientX, clientY) { const activeScene = scene(); if (!activeScene) { alert('Abra um mapa antes de inserir marcadores.'); return; } const point = clientX ? stagePoint(clientX, clientY) : { x: .5, y: .5 }; activeScene.markers.push({ id: createId('marker'), tokenId: tokenId || null, x: point.x, y: point.y, icon: '✦' }); renderMarkers(); queueSave(); }
  function addToken(tokenId, clientX, clientY) { addMarker(tokenId, clientX, clientY); }
  function renderMarkers() { const layer = $('#marker-layer'); const activeScene = scene(); if (!activeScene) return; layer.innerHTML = ''; activeScene.markers.forEach(marker => { const button = document.createElement('button'); button.className = 'marker'; button.dataset.markerId = marker.id; button.style.left = `${marker.x * 100}%`; button.style.top = `${marker.y * 100}%`; const token = state.assets.find(asset => asset.id === marker.tokenId); if (token) loadMarkerImage(token, button); else button.textContent = marker.icon; button.title = 'Arraste para mover · clique com o botão direito para remover'; button.addEventListener('pointerdown', startMarkerDrag); button.addEventListener('contextmenu', event => { event.preventDefault(); activeScene.markers = activeScene.markers.filter(item => item.id !== marker.id); renderMarkers(); queueSave(); }); layer.append(button); }); }
  async function loadMarkerImage(token, element) { const url = await urlFor(token); if (url && element.isConnected) element.innerHTML = `<img draggable="false" alt="${escapeHtml(token.name)}" src="${url}" />`; }
  function startMarkerDrag(event) { event.stopPropagation(); const button = event.currentTarget; const target = scene()?.markers.find(item => item.id === button.dataset.markerId); if (!target) return; const move = moveEvent => { const point = stagePoint(moveEvent.clientX, moveEvent.clientY); target.x = point.x; target.y = point.y; button.style.left = `${target.x * 100}%`; button.style.top = `${target.y * 100}%`; }; const end = () => { document.removeEventListener('pointermove', move); queueSave(); }; document.addEventListener('pointermove', move); document.addEventListener('pointerup', end, { once: true }); }

  function renderSession() { $('#session-notes').value = state.active.notes || ''; renderInitiative(); renderMusic(); }
  function addInitiative() { const name = $('#initiative-name').value.trim(); const value = Number($('#initiative-value').value); if (!name) return; state.active.initiative.push({ id: createId('initiative'), name, value: Number.isFinite(value) ? value : 0 }); state.active.initiative.sort((a, b) => b.value - a.value); $('#initiative-name').value = ''; $('#initiative-value').value = ''; renderInitiative(); queueSave(); }
  function renderInitiative() { $('#round-label').textContent = `— rodada ${state.active.round}`; const list = $('#initiative-list'); list.innerHTML = ''; state.active.initiative.forEach((entry, index) => { const item = document.createElement('li'); item.className = 'initiative-row'; item.innerHTML = `<span class="initiative-value">${entry.value}</span><span>${escapeHtml(entry.name)}</span><span class="move-buttons"><button aria-label="Subir">↑</button><button aria-label="Descer">↓</button><button aria-label="Remover">×</button></span>`; const buttons = item.querySelectorAll('button'); buttons[0].addEventListener('click', () => moveInitiative(index, -1)); buttons[1].addEventListener('click', () => moveInitiative(index, 1)); buttons[2].addEventListener('click', () => { state.active.initiative.splice(index, 1); renderInitiative(); queueSave(); }); list.append(item); }); }
  function moveInitiative(index, direction) { const target = index + direction; if (target < 0 || target >= state.active.initiative.length) return; [state.active.initiative[index], state.active.initiative[target]] = [state.active.initiative[target], state.active.initiative[index]]; renderInitiative(); queueSave(); }
  function rollDice(quantity, sides, modifier) { quantity = Math.max(1, Math.min(30, quantity || 1)); sides = Math.max(2, Math.min(1000, sides || 20)); modifier = Number(modifier) || 0; const rolls = Array.from({ length: quantity }, () => Math.floor(Math.random() * sides) + 1); const total = rolls.reduce((sum, value) => sum + value, modifier); $('#roll-result').textContent = `${total}  ·  ${quantity}d${sides}${modifier ? (modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`) : ''}`; const log = document.createElement('div'); log.textContent = `[${rolls.join(', ')}]${modifier ? ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}` : ''} = ${total}`; $('#roll-log').prepend(log); }
  async function renderMusic() { const select = $('#music-select'); const chosen = state.active.music.id; select.innerHTML = '<option value="">Escolha uma música</option>' + state.assets.filter(asset => asset.category === 'Músicas' && asset.type === 'áudio').map(asset => `<option value="${asset.id}">${escapeHtml(asset.name)}</option>`).join(''); select.value = chosen || ''; $('#volume-range').value = state.active.music.volume ?? .7; const player = $('#audio-player'); player.volume = state.active.music.volume ?? .7; if (!chosen) { player.removeAttribute('src'); player.load(); $('#music-status').textContent = 'Sem faixa'; return; } const asset = state.assets.find(item => item.id === chosen); const url = await urlFor(asset); if (url && player.src !== url) { player.src = url; player.onloadedmetadata = () => { player.currentTime = state.active.music.time || 0; }; } $('#music-status').textContent = state.active.music.playing ? 'Pronta para retomar' : 'Pausada'; }
  async function setMusic(assetId) { const player = $('#audio-player'); state.active.music = { id: assetId, time: 0, volume: Number($('#volume-range').value), playing: false }; queueSave(); await renderMusic(); if (assetId) player.play().catch(() => {}); }
  function beginNewSession() { state.active = emptySession(); state.resumed = true; currentMapId = null; queueSave(); renderAll(); showView('sessao'); }
  function restoreActive() { state.resumed = true; renderAll(); if (state.active.currentMap) showView('mapa'); else showView('sessao'); }
  function endSession(event) { event.preventDefault(); const summary = $('#session-summary').value.trim(); if (!summary) return; state.history.unshift({ id: createId('session'), endedAt: new Date().toISOString(), summary, snapshot: safeClone(state.active) }); $('#session-summary').value = ''; $('#end-dialog').close(); state.active = emptySession(); state.resumed = true; queueSave(); renderAll(); showView('historico'); }
  function renderHistory() { const container = $('#session-history'); if (!state.history.length) { container.innerHTML = '<div class="empty-state visible"><div class="empty-icon">◷</div><h2>Ainda não há sessões registradas</h2><p>Ao encerrar uma sessão, o estado completo e o resumo ficam disponíveis aqui.</p></div>'; return; } container.innerHTML = state.history.map(item => `<article class="history-item"><div><time>${prettyDate(item.endedAt)}</time><h2>Sessão registrada</h2><p>${escapeHtml(item.summary)}</p></div><button class="primary-button" data-restore="${item.id}">Retomar</button></article>`).join(''); $$('[data-restore]').forEach(button => button.addEventListener('click', () => { const item = state.history.find(entry => entry.id === button.dataset.restore); if (!item || !confirm('Retomar esta sessão no lugar do estado atual?')) return; state.active = safeClone(item.snapshot); state.resumed = true; queueSave(); renderAll(); restoreActive(); })); }

  function registerWebMcp() {
    const context = document.modelContext; if (!context?.registerTool) return;
    const controller = new AbortController();
    const register = (tool) => Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch(error => console.warn('WebMCP não disponível', error));
    register({ name: 'get_session_state', title: 'Ler estado da sessão', description: 'Lê o mapa, rodada, iniciativa e música da sessão atual.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => ({ mapId: state.active.currentMap, round: state.active.round, initiative: state.active.initiative.map(({ name, value }) => ({ name, value })), musicId: state.active.music.id }) });
    register({ name: 'add_initiative_entry', title: 'Adicionar à iniciativa', description: 'Adiciona um participante à lista de iniciativa da sessão atual.', inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 1 }, value: { type: 'number' } }, required: ['name', 'value'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: ({ name, value }) => { if (typeof name !== 'string' || !name.trim() || !Number.isFinite(value)) throw new Error('Nome e iniciativa válidos são obrigatórios.'); state.active.initiative.push({ id: createId('initiative'), name: name.trim(), value }); state.active.initiative.sort((a, b) => b.value - a.value); renderInitiative(); queueSave(); return { added: name.trim(), value, count: state.active.initiative.length }; } });
  }
  boot().then(registerWebMcp);
})();
