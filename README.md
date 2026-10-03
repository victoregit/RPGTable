# RPGTable

Mesa virtual local para campanhas de RPG, com mapas, personagens, dados, música e notas persistidas no navegador.

## Estrutura

- `app/`: interface web, scripts e assets estáticos.
- `app/styles/`: estilos da interface.
- `app/scripts/`: lógica da mesa e renderizadores.
- `app/vendor/`: arquivos distribuídos pelo visualizador de dados.
- `server.js`: servidor local e endpoint de leitura de PDF.

## Executar

```powershell
npm install
npm start
```

Abra `http://127.0.0.1:4173` no Edge ou Chrome. O atalho `Abrir Central de Campanha.bat` executa o mesmo servidor.
