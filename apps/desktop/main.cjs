const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell, utilityProcess } = require('electron');
const { mkdir, readFile, copyFile, readdir } = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

app.setName('kerCAD');
const legacy = require('./desktop-variant.json').variant === 'legacy';
app.setPath('userData', path.join(app.getPath('appData'), legacy ? 'kerCAD-Desktop-Legacy' : 'kerCAD-Desktop'));
protocol.registerSchemesAsPrivileged([{ scheme: 'kercad', privileges: {
  standard: true, secure: true, supportFetchAPI: true, stream: true,
  corsEnabled: true, allowServiceWorkers: true, codeCache: true,
} }]);
const resources = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');
const serverRoot = path.join(resources, 'server');
const windows = new Set();
const closing = new Set();
let server, serverURL, log, quitting = false, quitPending = false, expectedExit = false, serverExited = false;
let locale = 'en';
let catalogs;
async function text(key) {
  if (!catalogs) {
    catalogs = {};
    for (const file of await readdir(path.join(__dirname, 'locales'))) {
      if (file.endsWith('.json')) catalogs[file.slice(0, -5)] = JSON.parse(await readFile(path.join(__dirname, 'locales', file), 'utf8')).messages;
    }
  }
  return (catalogs[locale] ?? catalogs[locale.split('-')[0]] ?? catalogs.en)[key] ?? catalogs.en[key];
}
function internal(raw) {
  try { const url = new URL(raw); return url.protocol === 'kercad:' && url.hostname === 'app' && !url.port && !url.username && !url.password; }
  catch { return false; }
}
function external(raw) {
  try { const url = new URL(raw); if (['https:', 'http:'].includes(url.protocol)) void shell.openExternal(url.href); }
  catch { /* Never pass other schemes to the OS. */ }
}
async function startServer() {
  const data = app.getPath('userData');
  for (const dir of ['SharedProjects', 'Challenges', 'Logs']) await mkdir(path.join(data, dir), { recursive: true });
  // Seed bundled packages without replacing teachers' installed/edited ZIPs.
  const bundled = path.join(serverRoot, 'bundled-challenges');
  const { constants } = require('node:fs');
  try {
    for (const file of await readdir(bundled)) if (/\.zip$/i.test(file)) {
      try { await copyFile(path.join(bundled, file), path.join(data, 'Challenges', file), constants.COPYFILE_EXCL); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  log = createWriteStream(path.join(data, 'Logs', 'server.log'), { flags: 'a' });
  log.on('error', (error) => console.error(error));
  const env = { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    HOSTNAME: '127.0.0.1', PORT: '0', KERCAD_CANONICAL_HOST: 'off', SKETCHFORGE_ENABLE_MCP: 'false',
    KERCAD_SHARED_PROJECTS_DIR: path.join(data, 'SharedProjects'), KERCAD_CHALLENGES_DIR: path.join(data, 'Challenges'),
  };
  for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ASAR']) delete env[key];
  server = utilityProcess.fork(path.join(__dirname, 'server.cjs'), [path.join(serverRoot, 'apps/web/server.js')], {
    env, stdio: 'pipe', serviceName: 'kerCAD local server',
  });
  server.stdout?.pipe(log, { end: false }); server.stderr?.pipe(log, { end: false });
  const listening = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 120000);
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    server.once('message', (message) => {
      clearTimeout(timer);
      if (!Number.isInteger(message.port) || message.port < 1 || message.port > 65535) reject(new Error('Invalid server port'));
      else resolve(`http://127.0.0.1:${message.port}`);
    });
  });
  let exited = false;
  server.once('exit', () => {
    serverExited = true;
    exited = true;
    if (!expectedExit && serverURL) void fatal(new Error('Local server stopped unexpectedly'));
  });
  const origin = await listening;
  for (let attempt = 0; attempt < 120 && !exited; attempt++) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) });
      const status = await response.json();
      if (response.ok && status.application === 'kerCAD' && status.status === 'ok') { serverURL = origin; return; }
    } catch { /* Wait for the application, not merely an open TCP socket. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Application health check failed');
}
async function stopServer() {
  expectedExit = true;
  if (server && !serverExited) await new Promise((resolve) => {
    const timer = setTimeout(() => {
      // Only terminate the child we own, never another process using a port.
      if (!serverExited && server.pid) { try { process.kill(server.pid, 'SIGKILL'); } catch {} }
      resolve();
    }, 5000);
    server.once('exit', () => { clearTimeout(timer); resolve(); });
    server.kill();
  });
  log?.end();
}
async function fatal(error) {
  console.error(error); log?.write(`${error.stack ?? error}\n`);
  await dialog.showMessageBox({ type: 'error', title: await text('desktop.errorTitle'),
    message: await text('desktop.startFailed'), detail: `${await text('desktop.logs')}\n${path.join(app.getPath('userData'), 'Logs', 'server.log')}`, });
  if (windows.size) { app.quit(); return; }
  quitting = true; await stopServer(); app.quit();
}
function flushWindow(window) {
  return new Promise((resolve, reject) => {
    const token = randomUUID();
    const cleanup = () => { clearTimeout(timer); ipcMain.removeListener('kercad:close-result', result); };
    const result = (event, response) => {
      if (event.sender !== window.webContents || response?.token !== token || !internal(event.senderFrame?.url)) return;
      cleanup();
      if (typeof response.locale === 'string') locale = response.locale;
      response.ok ? resolve() : reject(new Error('Save failed'));
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Save timed out')); }, 15000);
    ipcMain.on('kercad:close-result', result);
    window.webContents.send('kercad:before-close', token);
  });
}
async function closeWindow(window) {
  if (closing.has(window)) return false;
  closing.add(window);
  try {
    try { await flushWindow(window); }
    catch {
      const answer = await dialog.showMessageBox(window, { type: 'warning', title: await text('desktop.errorTitle'),
        message: await text('desktop.saveFailed'), buttons: [await text('desktop.retry'), await text('desktop.cancel'), await text('desktop.discard')],
        defaultId: 0, cancelId: 1, noLink: true,
      });
      if (answer.response === 1) return false;
      if (answer.response === 0) { closing.delete(window); return closeWindow(window); }
    }
    window.destroy(); return true;
  } finally { closing.delete(window); }
}
function createWindow(url = 'kercad://app/') {
  const window = new BrowserWindow({ width: 1320, height: 860, minWidth: 640, minHeight: 480,
    show: false, title: 'kerCAD', backgroundColor: '#101820', icon: path.join(app.isPackaged ? resources : path.resolve(__dirname, '../icons'), 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true, partition: 'persist:kercad',
    },
  });
  windows.add(window);
  window.once('closed', () => windows.delete(window));
  window.once('ready-to-show', () => window.show());
  window.on('close', (event) => { if (!quitting) { event.preventDefault(); void closeWindow(window); } });
  window.webContents.on('will-navigate', (event, target) => { if (!internal(target)) { event.preventDefault(); external(target); } });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (internal(url)) createWindow(url); else external(url);
    return { action: 'deny' };
  });
  void window.loadURL(url).catch(fatal);
  return window;
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const window = [...windows][0]; if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.on('window-all-closed', () => { if (!quitPending) app.quit(); });
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    if (quitPending) return;
    quitPending = true;
    void (async () => {
      try {
        for (const window of [...windows]) if (!await closeWindow(window)) return;
        quitting = true; await stopServer(); app.quit();
      } finally { quitPending = false; }
    })();
  });
  app.whenReady().then(async () => {
    locale = app.getLocale() || 'en';
    await startServer();
    const ses = session.fromPartition('persist:kercad');
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
    });
    ses.protocol.handle('kercad', async (request) => {
      if (!internal(request.url)) return new Response(null, { status: 403 });
      const url = new URL(request.url), headers = new Headers(request.headers);
      headers.delete('host');
      const origin = headers.get('origin');
      if (origin && !internal(origin)) return new Response(null, { status: 403 });
      // SVG masks use CORS image requests. Their renderer origin is kercad://app,
      // but the private HTTP hop must see its own origin (also for API writes).
      if (origin) headers.set('origin', serverURL);
      const response = await net.fetch(`${serverURL}${url.pathname}${url.search}`, {
        method: request.method, headers, redirect: 'manual',
        ...(!['GET', 'HEAD'].includes(request.method) ? { body: await request.arrayBuffer() } : {}),
      });
      const outgoing = new Headers(response.headers);
      outgoing.set('access-control-allow-origin', 'kercad://app');
      outgoing.set('access-control-allow-credentials', 'true');
      outgoing.delete('content-encoding'); outgoing.delete('content-length');
      if (outgoing.has('location')) {
        const redirect = new URL(outgoing.get('location'), serverURL);
        if (redirect.origin !== serverURL) return new Response(null, { status: 403 });
        outgoing.set('location', `kercad://app${redirect.pathname}${redirect.search}${redirect.hash}`);
      }
      return new Response(response.body, { status: response.status, headers: outgoing });
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    ]));
    createWindow();
  }).catch(fatal);
}
