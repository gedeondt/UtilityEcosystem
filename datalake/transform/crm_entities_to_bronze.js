const fs = require('fs');
const path = require('path');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'data', 'bronce', 'crm');

const landingRoot = path.resolve(
  process.env.CRM_LANDING_DIR || process.argv[2] || path.join(__dirname, '..', 'data', 'landing', 'crm')
);
const outputDir = path.resolve(
  process.env.CRM_BRONZE_OUTPUT_DIR || process.argv[3] || DEFAULT_OUTPUT_DIR
);
const intervalMs = Number(process.env.CRM_BRONZE_INTERVAL_MS || process.argv[4] || DEFAULT_INTERVAL_MS);

if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
  console.error('Interval must be a positive number of milliseconds.');
  process.exit(1);
}

const verbose = process.env.TE_VERBOSE === 'true';
const verboseLog = (...args) => {
  if (verbose) {
    console.info(...args);
  }
};

const ENTITY_DATA_FIELDS = Object.freeze({
  clients: 'clients',
  'billing-accounts': 'billingAccounts',
  'supply-points': 'supplyPoints',
  contracts: 'contracts'
});

async function ensureDirectory(directoryPath) {
  await fs.promises.mkdir(directoryPath, { recursive: true });
}

async function listSnapshotDirectories(root) {
  try {
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function listJsonFiles(directoryPath) {
  try {
    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
      .map((entry) => entry.name);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function readJsonFile(filePath) {
  const raw = await fs.promises.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function sanitiseName(input) {
  return input
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function buildBronzePayload(entityName, snapshotName, payload) {
  const records = Array.isArray(payload.data) ? payload.data : [];
  const dataField = ENTITY_DATA_FIELDS[entityName];

  const bronzePayload = {
    refreshedAt: new Date().toISOString(),
    snapshot: snapshotName,
    endpoint: payload.endpoint || `/${entityName}`,
    sourceServiceUrl: payload.serviceUrl || null,
    totalItems: records.length,
    pagination: payload.pagination || null,
    data: records
  };

  if (dataField) {
    bronzePayload[dataField] = records;
  }

  return bronzePayload;
}

async function persistBronzeEntity(snapshotName, entityFile) {
  const entityName = sanitiseName(entityFile.replace(/\.json$/i, ''));
  const snapshotFilePath = path.join(landingRoot, snapshotName, entityFile);

  let payload;
  try {
    payload = await readJsonFile(snapshotFilePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`File ${entityFile} disappeared before it could be processed. Skipping.`);
      return;
    }
    console.error(`Failed to read CRM snapshot file ${snapshotFilePath}:`, error);
    return;
  }

  const bronzePayload = buildBronzePayload(entityName, snapshotName, payload);
  const outputFile = path.join(outputDir, `${entityName}_latest.json`);

  await ensureDirectory(path.dirname(outputFile));
  await fs.promises.writeFile(outputFile, JSON.stringify(bronzePayload, null, 2), 'utf8');
  console.info(`Refreshed CRM bronze dataset for ${entityName} -> ${outputFile}`);
}

let lastProcessedSnapshot = null;

async function refreshBronzeEntities() {
  const snapshotDirs = await listSnapshotDirectories(landingRoot);
  if (snapshotDirs.length === 0) {
    verboseLog('No CRM snapshots available yet.');
    return;
  }

  snapshotDirs.sort();
  const latestSnapshot = snapshotDirs[snapshotDirs.length - 1];

  if (latestSnapshot === lastProcessedSnapshot) {
    verboseLog(`Snapshot ${latestSnapshot} already processed. Skipping.`);
    return;
  }

  const jsonFiles = await listJsonFiles(path.join(landingRoot, latestSnapshot));
  if (jsonFiles.length === 0) {
    console.warn(`Snapshot ${latestSnapshot} does not contain CRM entity JSON files.`);
    lastProcessedSnapshot = latestSnapshot;
    return;
  }

  await ensureDirectory(outputDir);

  for (const entityFile of jsonFiles) {
    try {
      await persistBronzeEntity(latestSnapshot, entityFile);
    } catch (error) {
      console.error(`Unexpected error while processing ${entityFile} from snapshot ${latestSnapshot}:`, error);
    }
  }

  lastProcessedSnapshot = latestSnapshot;
}

let shuttingDown = false;
let currentHandle = null;
let currentCycle = Promise.resolve();

async function start() {
  currentCycle = refreshBronzeEntities();
  await currentCycle;

  if (shuttingDown) {
    return;
  }

  currentHandle = setInterval(() => {
    if (shuttingDown) {
      return;
    }

    currentCycle = currentCycle
      .catch(() => {})
      .then(() =>
        refreshBronzeEntities().catch((error) => {
          console.error('Unexpected error refreshing CRM bronze datasets:', error);
        })
      );
  }, intervalMs);
}

function setupSignalHandlers() {
  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, () => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      console.log(`Received ${signal}. Stopping CRM bronze refresh...`);

      if (currentHandle) {
        clearInterval(currentHandle);
        currentHandle = null;
      }

      currentCycle
        .catch((error) => {
          console.error('Error while finishing CRM bronze refresh cycle:', error);
        })
        .finally(() => {
          process.exit(0);
        });
    });
  }
}

setupSignalHandlers();

start().catch((error) => {
  console.error('Fatal error starting CRM bronze refresh script:', error);
  process.exit(1);
});

