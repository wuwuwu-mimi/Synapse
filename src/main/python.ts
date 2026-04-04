import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { RuntimeConfig } from '@shared/types';

interface ManagedPythonService extends RuntimeConfig {
  dispose: () => void;
}

const DEFAULT_BACKEND_URL = process.env.RAG_BACKEND_URL ?? 'http://127.0.0.1:8000';

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function isBackendHealthy(backendUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${backendUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(backendUrl: string, timeoutMs = 8000): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isBackendHealthy(backendUrl)) {
      return true;
    }
    await delay(400);
  }

  return false;
}

function wireLogs(child: ChildProcess): void {
  child.stdout?.on('data', (chunk) => {
    console.log(`[python] ${chunk.toString().trim()}`);
  });

  child.stderr?.on('data', (chunk) => {
    console.warn(`[python] ${chunk.toString().trim()}`);
  });
}

function resolvePythonCommands(): Array<{ command: string; hidden: boolean }> {
  const configured = process.env.PYTHON_EXECUTABLE?.trim();
  const candidates: Array<{ command: string; hidden: boolean }> = [];

  if (configured) {
    const normalized = configured.replace(/\//g, path.sep);
    const dirname = path.dirname(normalized);
    const basename = path.basename(normalized).toLowerCase();
    if (process.platform === 'win32' && basename === 'python.exe') {
      const pythonw = path.join(dirname, 'pythonw.exe');
      if (existsSync(pythonw)) {
        candidates.push({ command: pythonw, hidden: true });
      }
    }
    candidates.push({ command: configured, hidden: false });
  }

  candidates.push({ command: 'python', hidden: false });
  candidates.push({ command: 'py', hidden: false });

  return candidates.filter(
    (candidate, index, list) =>
      list.findIndex((item) => item.command.toLowerCase() === candidate.command.toLowerCase()) ===
      index
  );
}

export async function startPythonService(): Promise<ManagedPythonService> {
  const autoStart = process.env.RAG_BACKEND_AUTOSTART !== 'false';

  if (await isBackendHealthy(DEFAULT_BACKEND_URL)) {
    return {
      backendUrl: DEFAULT_BACKEND_URL,
      autoStarted: false,
      dispose: () => undefined
    };
  }

  if (!autoStart) {
    return {
      backendUrl: DEFAULT_BACKEND_URL,
      autoStarted: false,
      dispose: () => undefined
    };
  }

  const serviceDir = path.join(process.cwd(), 'python_service');
  const entryExists = existsSync(path.join(serviceDir, 'app', 'main.py'));

  if (!entryExists) {
    console.warn('python_service/app/main.py not found, backend autostart skipped.');
    return {
      backendUrl: DEFAULT_BACKEND_URL,
      autoStarted: false,
      dispose: () => undefined
    };
  }

  const commands = resolvePythonCommands();

  for (const candidate of commands) {
    const command = candidate.command;
    const args =
      command === 'py'
        ? ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000']
        : ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'];

    const child = spawn(command, args, {
      cwd: serviceDir,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      },
      stdio: candidate.hidden ? 'ignore' : 'pipe',
      windowsHide: true
    });

    if (!candidate.hidden) {
      wireLogs(child);
    }

    const ready = await Promise.race([
      waitForHealth(DEFAULT_BACKEND_URL, 8000),
      new Promise<boolean>((resolve) => {
        child.once('error', () => resolve(false));
        child.once('exit', () => resolve(false));
      })
    ]);

    if (ready) {
      return {
        backendUrl: DEFAULT_BACKEND_URL,
        autoStarted: true,
        dispose: () => {
          if (!child.killed) {
            child.kill();
          }
        }
      };
    }

    if (!child.killed) {
      child.kill();
    }
  }

  console.warn('Unable to autostart Python backend, renderer will use configured URL directly.');
  return {
    backendUrl: DEFAULT_BACKEND_URL,
    autoStarted: false,
    dispose: () => undefined
  };
}
