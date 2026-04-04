import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron';
import type {
  KnowledgeImportEntry,
  KnowledgeImportRequest,
  KnowledgeImportResult,
} from '@shared/types';

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt']);
const IMPORT_MANIFEST_FILE = '.synapse-import.json';

interface ImportManifest {
  label: string;
  sourceNames: string[];
}

function getKnowledgeRoot(): string {
  return path.join(process.cwd(), 'knowledge');
}

function getBatchRoot(kind: KnowledgeImportRequest['mode']): string {
  return path.join(getKnowledgeRoot(), 'imports', kind);
}

function getImportsRoot(): string {
  return path.join(getKnowledgeRoot(), 'imports');
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

async function countSupportedFiles(folderPath: string): Promise<number> {
  const files = await collectSupportedFiles(folderPath);
  return files.length;
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

function createImportLabel(sourceNames: string[]): string {
  if (sourceNames.length === 0) {
    return 'import';
  }
  if (sourceNames.length === 1) {
    return sourceNames[0];
  }
  if (sourceNames.length === 2) {
    return `${sourceNames[0]}, ${sourceNames[1]}`;
  }
  return `${sourceNames[0]} +${sourceNames.length - 1}`;
}

async function writeImportManifest(batchDir: string, sourceNames: string[]): Promise<void> {
  await mkdir(batchDir, { recursive: true });
  const manifest: ImportManifest = {
    label: createImportLabel(sourceNames),
    sourceNames,
  };
  await writeFile(
    path.join(batchDir, IMPORT_MANIFEST_FILE),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
}

async function readImportManifest(batchDir: string): Promise<ImportManifest | null> {
  try {
    const raw = await readFile(path.join(batchDir, IMPORT_MANIFEST_FILE), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ImportManifest>;
    return {
      label:
        typeof parsed.label === 'string' && parsed.label.trim()
          ? parsed.label.trim()
          : path.basename(batchDir),
      sourceNames: Array.isArray(parsed.sourceNames)
        ? parsed.sourceNames.filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0,
          )
        : [],
    };
  } catch {
    return null;
  }
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
    const sourceNames: string[] = [];
    for (const sourcePath of payload.paths) {
      if (!isSupportedFile(sourcePath)) {
        skippedPaths.push(sourcePath);
        continue;
      }

      const absoluteSource = path.resolve(sourcePath);
      sourceNames.push(path.basename(absoluteSource));
      if (absoluteSource.startsWith(knowledgeRoot)) {
        importedPaths.push(absoluteSource);
        continue;
      }

      const targetPath = path.join(batchDir, sanitizeSegment(path.basename(sourcePath)));
      importedPaths.push(await copyIntoKnowledgeRoot(absoluteSource, targetPath));
    }

    if (importedPaths.length > 0) {
      await writeImportManifest(batchDir, sourceNames);
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
  const sourceNames = [path.basename(absoluteFolder)];

  for (const filePath of files) {
    if (filePath.startsWith(knowledgeRoot)) {
      importedPaths.push(filePath);
      continue;
    }

    const relativePath = path.relative(absoluteFolder, filePath);
    const targetPath = path.join(batchDir, relativePath);
    importedPaths.push(await copyIntoKnowledgeRoot(filePath, targetPath));
  }

  if (importedPaths.length > 0) {
    await writeImportManifest(batchDir, sourceNames);
  }

  return {
    importedCount: importedPaths.length,
    importedPaths,
    skippedPaths,
    targetRoot: batchDir,
  };
}

function toImportEntry(
  mode: KnowledgeImportRequest['mode'],
  absolutePath: string,
  fileCount: number,
  updatedAt: string,
): KnowledgeImportEntry {
  const label = path.basename(absolutePath) || `${mode}-import`;
  const sourcePrefix = path
    .relative(getKnowledgeRoot(), absolutePath)
    .split(path.sep)
    .join('/');
  return {
    id: `${mode}:${absolutePath}`,
    mode,
    label,
    rootPath: absolutePath,
    sourcePrefix,
    sourceNames: [label],
    fileCount,
    updatedAt,
  };
}

export async function listKnowledgeImports(): Promise<KnowledgeImportEntry[]> {
  const importsRoot = getImportsRoot();
  const entries: KnowledgeImportEntry[] = [];

  for (const mode of ['files', 'folder'] as const) {
    const modeRoot = path.join(importsRoot, mode);
    try {
      const batches = await readdir(modeRoot, { withFileTypes: true });
      for (const batch of batches) {
        if (!batch.isDirectory()) {
          continue;
        }
        const absolutePath = path.join(modeRoot, batch.name);
        const fileCount = await countSupportedFiles(absolutePath);
        const info = await stat(absolutePath);
        const fallbackEntry = toImportEntry(mode, absolutePath, fileCount, info.mtime.toISOString());
        const manifest = await readImportManifest(absolutePath);
        const discoveredNames = manifest
          ? manifest.sourceNames
          : (await collectSupportedFiles(absolutePath)).map((filePath) => path.basename(filePath));
        entries.push({
          ...fallbackEntry,
          label: manifest?.label ?? createImportLabel(discoveredNames) ?? fallbackEntry.label,
          sourceNames: discoveredNames.length ? discoveredNames : fallbackEntry.sourceNames,
        });
      }
    } catch {
      continue;
    }
  }

  return entries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function deleteKnowledgeImport(rootPath: string): Promise<void> {
  const importsRoot = path.resolve(getImportsRoot());
  const targetPath = path.resolve(rootPath);
  const relative = path.relative(importsRoot, targetPath);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Refusing to delete a path outside knowledge/imports.');
  }

  await rm(targetPath, { recursive: true, force: true });
}
