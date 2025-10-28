const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');

const DEFAULT_INTERVAL_MS = 3 * 60 * 1000;
const DEFAULT_FTP_PORT = 2121;
const DEFAULT_REMOTE_DIR = '/';

const [, , cliHost, cliPort, cliOutputDir, cliInterval] = process.argv;

const ftpHost = process.env.FTP_HOST || cliHost;
const ftpPortValue = process.env.FTP_PORT || cliPort;
const ftpPort = ftpPortValue ? Number(ftpPortValue) : DEFAULT_FTP_PORT;
const ftpRemoteDir = process.env.FTP_REMOTE_DIR || DEFAULT_REMOTE_DIR;
const outputDir = process.env.FTP_OUTPUT_DIR || cliOutputDir || path.resolve(__dirname, '..', 'data', 'landing', 'ftp');
const configuredInterval = process.env.FTP_POLL_INTERVAL_MS || cliInterval;
const intervalMs = configuredInterval ? Number(configuredInterval) : DEFAULT_INTERVAL_MS;

const isVerbose = process.env.TE_VERBOSE === 'true';
const verboseInfo = (...args) => {
  if (isVerbose) {
    console.info(...args);
  }
};

async function purgeOutputDirectory(directoryPath) {
  try {
    await fs.promises.rm(directoryPath, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`No se pudo limpiar el directorio ${directoryPath}:`, error.message);
    }
  }
}

function registerExitCleanup(directoryPath) {
  process.once('exit', () => {
    try {
      fs.rmSync(directoryPath, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`No se pudo limpiar el directorio ${directoryPath} al salir:`, error.message);
      }
    }
  });
}

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

function sanitisePathComponent(input) {
  return (input || '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '-')
    .replace(/[^a-z0-9-.]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
}

function buildTimestamp() {
  return new Date().toISOString().replace(/[.:]/g, '-');
}

function buildLocalFilePath(itemName, timestamp) {
  const parsed = path.parse(itemName);
  const baseName = sanitisePathComponent(parsed.name) || 'file';
  const extension = parsed.ext || '';
  return `${baseName}-${timestamp}${extension}`;
}

async function downloadFromFtp(outputDir) {
  const runStartedAt = new Date();
  const timestamp = buildTimestamp();
  const remoteDirComponent = sanitisePathComponent(ftpRemoteDir) || 'root';
  const runOutputDir = path.join(outputDir, remoteDirComponent);

  console.info(`Starting FTP ingestion cycle at ${runStartedAt.toISOString()}...`);
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    verboseInfo(`Connecting to FTP server ${ftpHost}:${ftpPort} as anonymous...`);
    await client.access({
      host: ftpHost,
      port: ftpPort,
      user: 'anonymous',
      password: 'anonymous@',
      secure: false
    });

    verboseInfo('Connection to FTP server established.');

    if (ftpRemoteDir && ftpRemoteDir !== DEFAULT_REMOTE_DIR) {
      verboseInfo(`Changing remote directory to ${ftpRemoteDir}`);
      await client.cd(ftpRemoteDir);
    } else {
      verboseInfo('Using FTP root directory.');
    }

    await ensureDirectory(runOutputDir);
    const listing = await client.list();

    verboseInfo(`Retrieved ${listing.length} entries from FTP directory.`);
    if (isVerbose) {
      listing.forEach((item) =>
        console.info('FTP entry metadata:', {
          name: item.name,
          type: item.type,
          isDirectory: item.isDirectory,
          size: item.size
        })
      );
    }

    const downloadableItems = listing.filter((item) => {
      const isDirectory = item.isDirectory === true || item.type === 'd';
      const isSymbolicLink = item.type === 'l';
      return !isDirectory && !isSymbolicLink;
    });

    if (downloadableItems.length === 0) {
      verboseInfo('No downloadable files were found in the FTP directory.');
    }

    for (const item of downloadableItems) {
      const localPath = path.join(runOutputDir, buildLocalFilePath(item.name, timestamp));
      const tempPath = `${localPath}.downloading`;

      try {
        await client.downloadTo(tempPath, item.name);
        await fs.promises.rename(tempPath, localPath);
        await client.remove(item.name);
        verboseInfo(`FTP file ${item.name} downloaded to ${localPath} and removed from server.`);
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

let pollingHandle = null;
let shuttingDown = false;

async function start(outputDir) {
  await purgeOutputDirectory(outputDir);
  await ensureDirectory(outputDir);
  await downloadFromFtp(outputDir);
  verboseInfo(
    `Scheduled recurring FTP ingestion every ${Math.round(intervalMs / 1000)} seconds.`
  );
  pollingHandle = setInterval(() => {
    downloadFromFtp(outputDir).catch((error) => {
      console.error('Error inesperado en el ciclo de ingesta del FTP:', error);
    });
  }, intervalMs);
}


function setupSignalHandlers() {
  registerExitCleanup(outputDir);

  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, () => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      console.log(`Recibida señal ${signal}, deteniendo ingesta del FTP...`);

      if (pollingHandle) {
        clearInterval(pollingHandle);
      }

      purgeOutputDirectory(outputDir)
        .catch((error) => {
          console.error('No se pudo limpiar el directorio de ingesta del FTP:', error);
        })
        .finally(() => {
          process.exit(0);
        });
    });
  }
}

setupSignalHandlers();

start(outputDir).catch((error) => {
  console.error('Fatal error starting FTP ingestion script:', error);
  purgeOutputDirectory(outputDir)
    .catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') {
        console.error('No se pudo limpiar el directorio tras fallo de arranque:', cleanupError);
      }
    })
    .finally(() => {
      process.exit(1);
    });
});
