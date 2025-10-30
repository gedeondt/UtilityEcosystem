import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EVENTLOG_ROOT =
  process.env.EVENTLOG_ROOT || path.resolve(__dirname, '..', '..', '..', '..', 'eventlog', 'log');

async function countFilesInDirectory(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries.reduce((total, entry) => {
    if (!entry.isFile()) {
      return total;
    }

    return entry.name.endsWith('.json') ? total + 1 : total;
  }, 0);
}

export async function getEventLogChannelStats() {
  let channelEntries;
  try {
    channelEntries = await readdir(EVENTLOG_ROOT, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const stats = await Promise.all(
    channelEntries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => ({
        name: entry.name,
        fileCount: await countFilesInDirectory(path.join(EVENTLOG_ROOT, entry.name)),
      }))
  );

  return stats.sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name));
}
