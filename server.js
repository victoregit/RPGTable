const http = require('http');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, 'app');
const pdfjsPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary',
  '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
};

function reply(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
  response.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function requestBody(request, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    request.on('data', chunk => { size += chunk.length; if (size > limit) { reject(new Error('O PDF é grande demais para importar.')); request.destroy(); } else chunks.push(chunk); });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function extractPdf(buffer) {
  const pdfjs = await import(pathToFileURL(pdfjsPath).href);
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true });
  const document = await task.promise;
  const pages = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    let previousY = null; let text = '';
    for (const item of content.items) {
      if (!item.str) continue;
      const y = item.transform?.[5] ?? previousY;
      if (previousY !== null && Math.abs(y - previousY) > 3) text += '\n';
      else if (text && !text.endsWith('\n')) text += ' ';
      text += item.str;
      previousY = y;
    }
    pages.push({ number, text: text.replace(/\n{3,}/g, '\n\n').trim() });
  }
  await document.destroy();
  return { pages, pageCount: pages.length, extractedAt: new Date().toISOString() };
}

http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(request.url.split('?')[0]);
  if (request.method === 'OPTIONS') { reply(response, 204, ''); return; }
  if (pathname === '/api/pdf-text' && request.method === 'POST') {
    try { reply(response, 200, await extractPdf(await requestBody(request))); }
    catch (error) { reply(response, 422, { error: error.message || 'Não foi possível ler este PDF.' }); }
    return;
  }
  const filename = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!(filename === root || filename.startsWith(`${root}${path.sep}`))) {
    response.writeHead(403).end('Acesso negado'); return;
  }
  fs.readFile(filename, (error, content) => {
    if (error) { response.writeHead(404).end('Arquivo não encontrado'); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(filename).toLowerCase()] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    response.end(content);
  });
}).listen(4173, '127.0.0.1', () => console.log('Central de Campanha: http://127.0.0.1:4173'));
