const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');

const DEFAULT_INTERVAL_MS = 3 * 60 * 1000;
const DEFAULT_FTP_PORT = 2121;
const DEFAULT_REMOTE_DIR = '/';

const [, , cliHost, cliOutputDir, cliInterval] = process.argv;

const ftpHost = process.env.FTP_HOST || cliHost;
const ftpPortValue = process.env.FTP_PORT;
const ftpPort = ftpPortValue ? Number(ftpPortValue) : DEFAULT_FTP_PORT;
const ftpRemoteDir = process.env.FTP_REMOTE_DIR || DEFAULT_REMOTE_DIR;
const outputDir = process.env.FTP_OUTPUT_DIR || cliOutputDir || path.resolve(__dirname, '..', 'data', 'landing', 'ftp');

const configuredInterval = process.env.FTP_POLL_INTERVAL_MS || cliInterval;
const intervalMs = configuredInterval ? Number(configuredInterval) : DEFAULT_INTERVAL_MS;

if (!ftpHost) {
  console.error('FTP host must be provided via FTP_HOST env var or first CLI argument.');
  process.exit(1);
}

if (!Number.isInteger(ftpPort) || ftpPort <= 0) {
  console.error('FTP port must be a positive integer.');
  process.exit(1);
}

if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
  console.error('Polling interval must be a positive number of milliseconds.');
  process.exit(1);
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
    console.info(`Connecting to FTP server ${ftpHost}:${ftpPort} as anonymous...`);
    await client.access({
      host: ftpHost,
      port: ftpPort,
      user: 'anonymous',
      password: 'anonymous@',
      secure: false
    });

    console.info('Connection to FTP server established.');

    if (ftpRemoteDir && ftpRemoteDir !== DEFAULT_REMOTE_DIR) {
      console.info(`Changing remote directory to ${ftpRemoteDir}`);
      await client.cd(ftpRemoteDir);
    } else {
      console.info('Using FTP root directory.');
    }

    await ensureDirectory(outputDir);
    const listing = await client.list();

    console.info(`Retrieved ${listing.length} entries from FTP directory.`);

    const downloadableItems = listing.filter((item) => item.type === '-');

    if (downloadableItems.length === 0) {
      console.info('No downloadable files were found in the FTP directory.');
    }

    for (const item of downloadableItems) {
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
  console.info(
    `Scheduled recurring FTP ingestion every ${Math.round(intervalMs / 1000)} seconds.`
  );
  setInterval(downloadFromFtp, intervalMs);
}

start().catch((error) => {
  console.error('Fatal error starting FTP ingestion script:', error);
  process.exit(1);
});
