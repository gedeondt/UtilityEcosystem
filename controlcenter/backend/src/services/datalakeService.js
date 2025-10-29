import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATALAKE_ROOT =
  process.env.DATALAKE_ROOT || path.resolve(__dirname, '..', '..', '..', '..', 'datalake', 'data');

const DATALAKE_FOLDERS = ['landing', 'bronce', 'silver', 'gold'];

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
  const stats = await Promise.all(
    DATALAKE_FOLDERS.map(async (folderName) => {
      const folderPath = path.join(DATALAKE_ROOT, folderName);

      try {
        return {
          name: folderName,
          fileCount: await countFilesRecursively(folderPath),
        };
      } catch (error) {
        if (error.code === 'ENOENT') {
          return {
            name: folderName,
            fileCount: 0,
          };
        }

        throw error;
      }
    })
  );

  return stats;
}
