const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const mammoth = require('mammoth');
const readXlsxFile = require('read-excel-file/node');
const { PDFParse } = require('pdf-parse');
const execFileAsync = promisify(execFile);
require('./groq-provider.cjs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'electron-preload.cjs')
    }
  });

  // `electron .` is also used for the local production build. Only opt into
  // Vite when the explicit development flag is supplied.
  const isDev = process.argv.includes('--dev');
  
  if (isDev) {
    // Em desenvolvimento, carrega via servidor Vite.
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // Em produção, carrega o arquivo estático buildado
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`Falha ao carregar ${url}: ${code} ${description}`);
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.error(`Renderer [${level}] ${sourceId}:${line}: ${message}`);
  });
}

const SUPPORTED_EXTENSIONS = new Set(['.docx', '.xlsx', '.pdf', '.csv', '.txt', '.md']);
const SKIPPED_DIRECTORIES = new Set(['imagem', 'imagens', 'image', 'images', 'foto', 'fotos', 'photo', 'photos', 'video', 'videos', 'vídeo', 'vídeos', 'media', 'mídia', 'midia', 'backup', 'backups', 'lixeira', 'trash', 'temp', 'tmp', 'cache', 'node_modules', '.git', '$recycle.bin']);

function isSkippedDirectory(name) {
  return SKIPPED_DIRECTORIES.has(name.trim().toLocaleLowerCase('pt-BR'));
}

async function extractText(filePath, extension) {
  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  if (extension === '.xlsx') {
    const sheets = await readXlsxFile(filePath, { getSheets: true });
    const parts = [];
    for (const sheet of sheets) {
      const rows = await readXlsxFile(filePath, { sheet: sheet.name });
      parts.push(`[PLANILHA: ${sheet.name}]\n${rows.map(row => row.map(cell => String(cell ?? '')).join(' | ')).join('\n')}`);
    }
    return parts.join('\n\n');
  }
  if (extension === '.pdf') {
    const parser = new PDFParse({ data: await fs.readFile(filePath) });
    try {
      const text = (await parser.getText()).text;
      // PDFs exported from applications have usable text. Scanned PDFs do not,
      // so OCR is only invoked when native extraction is effectively empty.
      if (text.replace(/\s/g, '').length >= 120) return text;
      const screenshots = await parser.getScreenshot({ scale: 2, imageDataUrl: false });
      const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ia-document-manager-ocr-'));
      try {
        const tessdataPath = path.join(__dirname, 'resources', 'tessdata');
        const tesseractPath = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
        const pages = [];
        for (let index = 0; index < screenshots.pages.length; index++) {
          const imagePath = path.join(tempDirectory, `page-${index + 1}.png`);
          await fs.writeFile(imagePath, screenshots.pages[index].data);
          const { stdout } = await execFileAsync(tesseractPath, [imagePath, 'stdout', '-l', 'por+eng', '--tessdata-dir', tessdataPath, '--psm', '6'], { windowsHide: true });
          pages.push(`[PÁGINA OCR ${index + 1}]\n${stdout}`);
        }
        return pages.join('\n\n');
      } finally {
        await fs.rm(tempDirectory, { recursive: true, force: true });
      }
    } finally {
      await parser.destroy();
    }
  }
  return fs.readFile(filePath, 'utf8');
}

async function readSupportedFiles(rootPath, company, sendProgress) {
  const files = [];
  async function visit(currentPath) {
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        if (!isSkippedDirectory(entry.name)) await visit(fullPath);
        continue;
      }
      const extension = path.extname(entry.name).toLocaleLowerCase('pt-BR');
      if (!entry.isFile() || !SUPPORTED_EXTENSIONS.has(extension) || entry.name.startsWith('~$')) continue;
      sendProgress({ message: `Lendo documento: ${relativePath}`, currentCompany: company, currentFile: relativePath });
      try {
        const [content, stats] = await Promise.all([extractText(fullPath, extension), fs.stat(fullPath)]);
        files.push({ name: entry.name, relativePath, sizeKb: stats.size / 1024, content, lastModified: stats.mtimeMs, status: content.trim() ? 'indexed' : 'empty' });
      } catch (error) {
        files.push({ name: entry.name, relativePath, sizeKb: 0, status: 'error', extractionError: error instanceof Error ? error.message : 'Erro de leitura' });
      }
    }
  }
  await visit(rootPath);
  return files;
}

ipcMain.handle('documents:scan-folder', async (event) => {
  const selection = await dialog.showOpenDialog({ title: 'Selecione a raiz das empresas', properties: ['openDirectory'] });
  if (selection.canceled || !selection.filePaths[0]) return { canceled: true, companies: [] };
  const rootPath = selection.filePaths[0];
  const rootEntries = await fs.readdir(rootPath, { withFileTypes: true });
  const companies = [];
  const folders = rootEntries.filter(entry => entry.isDirectory() && !isSkippedDirectory(entry.name));
  for (const folder of folders) {
    event.sender.send('documents:progress', { status: 'scanning', message: `Analisando empresa: ${folder.name}...`, currentCompany: folder.name });
    const files = await readSupportedFiles(path.join(rootPath, folder.name), folder.name, progress => event.sender.send('documents:progress', progress));
    if (files.length) companies.push({ company: folder.name.toUpperCase(), files });
  }
  return { canceled: false, companies };
});

ipcMain.handle('ollama:stop', async (_event, model) => {
  if (typeof model !== 'string' || !/^[a-zA-Z0-9._:/-]+$/.test(model)) return;
  try {
    await execFileAsync('ollama', ['stop', model], { windowsHide: true, timeout: 10_000 });
  } catch {
    // The HTTP abort still ends the request if the CLI is unavailable.
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
