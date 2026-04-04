import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ChatSession, KnowledgeImportRequest, RuntimeConfig } from '@shared/types';
import { importKnowledge, pickKnowledgeFiles, pickKnowledgeFolder } from './knowledge';
import { startPythonService } from './python';

let mainWindow: BrowserWindow | null = null;
let runtimeConfig: RuntimeConfig = {
  backendUrl: process.env.RAG_BACKEND_URL ?? 'http://127.0.0.1:8000',
  autoStarted: false
};
let disposePythonService = (): void => undefined;

function getDataFilePath(): string {
  return path.join(app.getPath('userData'), 'sessions.json');
}

async function ensureDataFile(): Promise<void> {
  const dataFilePath = getDataFilePath();
  await mkdir(path.dirname(dataFilePath), { recursive: true });

  try {
    await readFile(dataFilePath, 'utf8');
  } catch {
    await writeFile(dataFilePath, JSON.stringify({ sessions: [] }, null, 2), 'utf8');
  }
}

async function readSessions(): Promise<ChatSession[]> {
  await ensureDataFile();
  const raw = await readFile(getDataFilePath(), 'utf8');
  const parsed = JSON.parse(raw) as { sessions: ChatSession[] };
  return parsed.sessions ?? [];
}

async function writeSessions(sessions: ChatSession[]): Promise<void> {
  await ensureDataFile();
  await writeFile(getDataFilePath(), JSON.stringify({ sessions }, null, 2), 'utf8');
}

function createEmptySession(title?: string): ChatSession {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: title?.trim() || 'Synapse Chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
    inspector: {
      summary: '',
      facts: [],
      sources: []
    }
  };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    title: 'Synapse',
    backgroundColor: '#f5eee5',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:list-sessions', async () => {
    const sessions = await readSessions();
    return sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });

  ipcMain.handle('app:create-session', async (_event, title?: string) => {
    const sessions = await readSessions();
    const session = createEmptySession(title);
    const nextSessions = [session, ...sessions];
    await writeSessions(nextSessions);
    return session;
  });

  ipcMain.handle('app:upsert-session', async (_event, session: ChatSession) => {
    const sessions = await readSessions();
    const nextSessions = sessions.some((item) => item.id === session.id)
      ? sessions.map((item) => (item.id === session.id ? session : item))
      : [session, ...sessions];

    await writeSessions(
      nextSessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    );

    return session;
  });

  ipcMain.handle('app:get-runtime-config', async () => runtimeConfig);
  ipcMain.handle('knowledge:pick-files', async () => pickKnowledgeFiles(mainWindow));
  ipcMain.handle('knowledge:pick-folder', async () => pickKnowledgeFolder(mainWindow));
  ipcMain.handle('knowledge:import', async (_event, payload: KnowledgeImportRequest) =>
    importKnowledge(payload)
  );
}

app.whenReady().then(async () => {
  const managedService = await startPythonService();
  runtimeConfig = {
    backendUrl: managedService.backendUrl,
    autoStarted: managedService.autoStarted
  };
  disposePythonService = managedService.dispose;

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  disposePythonService();
});
