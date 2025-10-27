import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATALAKE_ROOT = process.env.DATALAKE_ROOT || path.resolve(__dirname, '..', '..', '..', 'datalake');

async function countFilesRecursively(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await countFilesRecursively(entryPath);
    } else if (entry.isFile()) {
      total += 1;
    }
  }

  return total;
}

export async function getDatalakeFolderStats() {
  const entries = await readdir(DATALAKE_ROOT, { withFileTypes: true });
  const folders = entries.filter((entry) => entry.isDirectory());

  const stats = await Promise.all(
    folders.map(async (folder) => ({
      name: folder.name,
      fileCount: await countFilesRecursively(path.join(DATALAKE_ROOT, folder.name)),
    }))
  );

  stats.sort((a, b) => a.name.localeCompare(b.name));
  return stats;
}
