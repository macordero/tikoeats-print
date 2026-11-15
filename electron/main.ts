// =============================================================================
// Main process — everything that needs the operating system:
//   • one window (the UI, which also runs the job loop) that hides to the
//     tray instead of closing, so printing keeps going in the background;
//   • start with the computer (login item);
//   • the computer's printers, and silent printing to one of them;
//   • local storage: the device token (encrypted with the OS keychain via
//     safeStorage) and the printer setup.
// =============================================================================

import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, safeStorage, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

// ---- local storage ------------------------------------------------------------

const storeDir = () => app.getPath('userData');
const storeFile = () => join(storeDir(), 'config.json');

type Stored = { tokenEnc?: string; tokenPlain?: string; printers?: unknown; [k: string]: unknown };

function readStore(): Stored {
  try {
    return existsSync(storeFile()) ? (JSON.parse(readFileSync(storeFile(), 'utf8')) as Stored) : {};
  } catch {
    return {};
  }
}
function writeStore(s: Stored) {
  mkdirSync(storeDir(), { recursive: true });
  writeFileSync(storeFile(), JSON.stringify(s, null, 2), 'utf8');
}

function getToken(): string | null {
  const s = readStore();
  if (s.tokenEnc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(s.tokenEnc, 'base64'));
    } catch {
      return null;
    }
  }
  return s.tokenPlain ?? null;
}
function setToken(token: string | null) {
  const s = readStore();
  delete s.tokenEnc;
  delete s.tokenPlain;
  if (token) {
    if (safeStorage.isEncryptionAvailable()) s.tokenEnc = safeStorage.encryptString(token).toString('base64');
    else s.tokenPlain = token; // Linux without a keyring; not a target platform
  }
  writeStore(s);
}

// ---- printing -------------------------------------------------------------------

/**
 * Prints one ticket (complete HTML, 72mm content) on a named printer, with
 * no dialog, through the printer's own driver.
 *
 * The page size MUST be set: left to the driver, Chromium lays the ticket
 * out on its default sheet (A4/Letter), centres the 72mm column on it and
 * the roll only catches its left edge.
 *
 * And it must be the PRINTABLE width, not the roll's: an 80mm thermal
 * printer only prints the middle 72mm (576 dots) and the driver already
 * starts the page at that printable edge. An 80mm page put the ticket's own
 * 4mm side margin on top of the printer's, so everything came out shifted
 * right with the end of each line cut off. 72mm page = ticket edge to edge
 * of what the head can print, centred on the paper.
 */
const PAPER_WIDTH_MM = 72;
const PX_TO_MICRONS = 25400 / 96; // 1 CSS px = 1/96 in

async function printHtml(deviceName: string, html: string, copies: number): Promise<void> {
  const pw = new BrowserWindow({
    show: false,
    // Lay it out at the paper's width so the measured height is the real one.
    width: Math.round((PAPER_WIDTH_MM * 1000) / PX_TO_MICRONS),
    height: 800,
    webPreferences: { sandbox: true, javascript: true },
  });
  try {
    await pw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    // Let images (logo, QR) decode before measuring and printing.
    await pw.webContents.executeJavaScript(
      'Promise.all(Array.from(document.images).map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })))',
    );
    const heightPx: number = await pw.webContents.executeJavaScript(
      'Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))',
    );
    const heightMicrons = Math.max(50_000, Math.ceil(heightPx * PX_TO_MICRONS) + 2_000);

    await new Promise<void>((resolve, reject) => {
      pw.webContents.print(
        {
          silent: true,
          deviceName,
          copies: Math.max(1, Math.min(5, copies || 1)),
          printBackground: true,
          landscape: false,
          margins: { marginType: 'none' },
          pageSize: { width: PAPER_WIDTH_MM * 1000, height: heightMicrons },
        },
        (ok, reason) => (ok ? resolve() : reject(new Error(reason || 'print_failed'))),
      );
    });
  } finally {
    pw.destroy();
  }
}

// ---- window & tray --------------------------------------------------------------

function iconPath() {
  // build/icon.png ships next to the app; fall back to Electron's default.
  const p = join(app.getAppPath(), 'build', 'icon.png');
  return existsSync(p) ? p : undefined;
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: 'Tiko Impresión',
    icon: iconPath(),
    autoHideMenuBar: true,
    show: !process.argv.includes('--hidden'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      // The job loop lives in this window: it must keep running while the
      // window is hidden in the tray.
      backgroundThrottling: false,
    },
  });

  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win?.hide();
    }
  });

  // Links (e.g. "abrir el panel") open in the real browser, never in here.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

function createTray() {
  const img = iconPath() ? nativeImage.createFromPath(iconPath()!).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip('Tiko Impresión');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Tiko Impresión', click: showWindow },
      { type: 'separator' },
      {
        label: 'Salir (deja de imprimir)',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', showWindow);
}

// ---- IPC (what the window may ask for) ----------------------------------------

ipcMain.handle('store:get', (_e, key: string) => readStore()[key] ?? null);
ipcMain.handle('store:set', (_e, key: string, value: unknown) => {
  if (key.startsWith('token')) return; // the token only goes through token:set
  const s = readStore();
  s[key] = value;
  writeStore(s);
});
ipcMain.handle('token:get', () => getToken());
ipcMain.handle('token:set', (_e, token: string | null) => setToken(token));
ipcMain.handle('printers:list', async () => {
  const list = await win!.webContents.getPrintersAsync();
  return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: p.isDefault }));
});
ipcMain.handle('print:html', (_e, deviceName: string, html: string, copies: number) =>
  printHtml(deviceName, html, copies),
);
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  hostname: hostname(),
  openAtLogin: app.getLoginItemSettings().openAtLogin,
}));
ipcMain.handle('app:setOpenAtLogin', (_e, on: boolean) => {
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
});
ipcMain.handle('app:show', () => showWindow());

// ---- lifecycle --------------------------------------------------------------------

// One copy only: two would both claim jobs and fight over the printer.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    // Starts with the computer by default (hidden, straight to the tray).
    if (!readStore().loginItemSet) {
      app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
      writeStore({ ...readStore(), loginItemSet: true });
    }
    createWindow();
    createTray();
    app.on('activate', showWindow); // macOS dock click
  });

  app.on('before-quit', () => {
    quitting = true;
  });
  // Closing the window never quits — only "Salir" in the tray does.
  app.on('window-all-closed', () => {});
}
