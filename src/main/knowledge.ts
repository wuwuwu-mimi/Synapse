import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron';
import type { KnowledgeImportRequest, KnowledgeImportResult } from '@shared/types';

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt']);

function getKnowledgeRoot(): string {
  return path.join(process.cwd(), 'knowledge');
}

function getBatchRoot(kind: KnowledgeImportRequest['mode']): string {
  return path.join(getKnowledgeRoot(), 'imports', kind);
}

function createBatchId(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}`;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'item';
}

function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function ensureUniquePath(filePath: string): Promise<string> {
  let candidate = filePath;
  let index = 1;

  while (true) {
    try {
      await stat(candidate);
      const parsed = path.parse(filePath);
      candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
      index += 1;
    } catch {
      return candidate;
    }
  }
}

async function collectSupportedFiles(folderPath: string): Promise<string[]> {
  const entries = await readdir(folderPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(folderPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSupportedFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && isSupportedFile(absolutePath)) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function copyIntoKnowledgeRoot(
  sourcePath: string,
  targetPath: string,
): Promise<string> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const uniqueTarget = await ensureUniquePath(targetPath);
  await copyFile(sourcePath, uniqueTarget);
  return uniqueTarget;
}

export async function pickKnowledgeFiles(window: BrowserWindow | null): Promise<string[]> {
  const options: OpenDialogOptions = {
    title: 'Select knowledge files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Knowledge files', extensions: ['md', 'txt'] }],
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);

  return result.canceled ? [] : result.filePaths;
}

export async function pickKnowledgeFolder(window: BrowserWindow | null): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: 'Select a folder to import',
    properties: ['openDirectory'],
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);

  return result.canceled ? null : result.filePaths[0] ?? null;
}

export async function importKnowledge(
  payload: KnowledgeImportRequest,
): Promise<KnowledgeImportResult> {
  const knowledgeRoot = getKnowledgeRoot();
  const batchRoot = getBatchRoot(payload.mode);
  const importedPaths: string[] = [];
  const skippedPaths: string[] = [];

  await mkdir(batchRoot, { recursive: true });

  if (payload.mode === 'files') {
    const batchDir = path.join(batchRoot, createBatchId('files'));
    for (const sourcePath of payload.paths) {
      if (!isSupportedFile(sourcePath)) {
        skippedPaths.push(sourcePath);
        continue;
      }

      const absoluteSource = path.resolve(sourcePath);
      if (absoluteSource.startsWith(knowledgeRoot)) {
        importedPaths.push(absoluteSource);
        continue;
      }

      const targetPath = path.join(batchDir, sanitizeSegment(path.basename(sourcePath)));
      importedPaths.push(await copyIntoKnowledgeRoot(absoluteSource, targetPath));
    }

    return {
      importedCount: importedPaths.length,
      importedPaths,
      skippedPaths,
      targetRoot: batchDir,
    };
  }

  const sourceFolder = payload.paths[0];
  if (!sourceFolder) {
    return {
      importedCount: 0,
      importedPaths,
      skippedPaths,
      targetRoot: batchRoot,
    };
  }

  const absoluteFolder = path.resolve(sourceFolder);
  const batchDir = path.join(batchRoot, createBatchId(sanitizeSegment(path.basename(sourceFolder))));
  const files = await collectSupportedFiles(absoluteFolder);

  for (const filePath of files) {
    if (filePath.startsWith(knowledgeRoot)) {
      importedPaths.push(filePath);
      continue;
    }

    const relativePath = path.relative(absoluteFolder, filePath);
    const targetPath = path.join(batchDir, relativePath);
    importedPaths.push(await copyIntoKnowledgeRoot(filePath, targetPath));
  }

  return {
    importedCount: importedPaths.length,
    importedPaths,
    skippedPaths,
    targetRoot: batchDir,
  };
}
