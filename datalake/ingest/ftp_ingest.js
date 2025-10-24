const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');

const DEFAULT_INTERVAL_MS = 3 * 60 * 1000;

const ftpHost = process.env.FTP_HOST || process.argv[2];
const ftpPort = Number(process.env.FTP_PORT || process.argv[3] || 21);
const ftpUser = process.env.FTP_USER || process.argv[4] || 'anonymous';
const ftpPassword = process.env.FTP_PASSWORD || process.argv[5] || 'guest';
const ftpRemoteDir = process.env.FTP_REMOTE_DIR || process.argv[6] || '/';
const ftpSecure = process.env.FTP_SECURE || process.argv[7] || 'false';
const outputDir = process.env.FTP_OUTPUT_DIR || process.argv[8] || path.resolve(__dirname, '..', 'data', 'landing', 'ftp');
const intervalMs = Number(process.env.FTP_POLL_INTERVAL_MS || process.argv[9] || DEFAULT_INTERVAL_MS);

if (!ftpHost) {
  console.error('FTP host must be provided via FTP_HOST env var or first CLI argument.');
  process.exit(1);
}

if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
  console.error('Polling interval must be a positive number of milliseconds.');
  process.exit(1);
}

function resolveSecureFlag(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'implicit') return 'implicit';
  return false;
}

async function ensureDirectory(directoryPath) {
  await fs.promises.mkdir(directoryPath, { recursive: true });
}

async function downloadFromFtp() {
  const runStartedAt = new Date();
  console.info(`Starting FTP ingestion cycle at ${runStartedAt.toISOString()}...`);
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: ftpHost,
      port: ftpPort,
      user: ftpUser,
      password: ftpPassword,
      secure: resolveSecureFlag(ftpSecure)
    });

    if (ftpRemoteDir && ftpRemoteDir !== '/') {
      await client.cd(ftpRemoteDir);
    }

    await ensureDirectory(outputDir);
    const listing = await client.list();

    for (const item of listing) {
      if (item.type !== '-') {
        // Skip directories and special entries.
        continue;
      }

      const localPath = path.join(outputDir, item.name);
      const tempPath = `${localPath}.downloading`;

      try {
        await client.downloadTo(tempPath, item.name);
        await fs.promises.rename(tempPath, localPath);
        await client.remove(item.name);
        console.info(`FTP file ${item.name} downloaded to ${localPath} and removed from server.`);
      } catch (error) {
        console.error(`Failed to download FTP file ${item.name}:`, error);
        try {
          await fs.promises.unlink(tempPath);
        } catch (cleanupError) {
          if (cleanupError.code !== 'ENOENT') {
            console.warn(`Unable to clean up temporary file ${tempPath}:`, cleanupError);
          }
        }
      }
    }
  } catch (error) {
    console.error('FTP ingestion cycle failed:', error);
  } finally {
    client.close();
  }
}

async function start() {
  await ensureDirectory(outputDir);
  await downloadFromFtp();
  setInterval(downloadFromFtp, intervalMs).unref();
}

start().catch((error) => {
  console.error('Fatal error starting FTP ingestion script:', error);
  process.exit(1);
});
