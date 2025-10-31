const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const CRM_ENDPOINTS = Object.freeze([
  '/clients',
  '/billing-accounts',
  '/supply-points',
  '/contracts'
]);

const serviceUrl = process.env.CRM_SERVICE_URL || process.argv[2];
const outputDir =
  process.env.CRM_OUTPUT_DIR || process.argv[3] || path.resolve(__dirname, '..', 'data', 'landing', 'crm');
const intervalMs = Number(process.env.CRM_POLL_INTERVAL_MS || process.argv[4] || DEFAULT_INTERVAL_MS);

const isVerbose = process.env.TE_VERBOSE === 'true';
const verboseInfo = (...args) => {
  if (isVerbose) {
    console.info(...args);
  }
};

if (!serviceUrl) {
  console.error('CRM service URL must be provided via CRM_SERVICE_URL env var or first CLI argument.');
  process.exit(1);
}

if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
  console.error('Polling interval must be a positive number of milliseconds.');
  process.exit(1);
}

async function ensureDirectory(directoryPath) {
  await fs.promises.mkdir(directoryPath, { recursive: true });
}

function sanitiseEndpointName(endpointPath) {
  return endpointPath
    .replace(/^\/+/, '')
    .replace(/\/+/g, '-')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'root';
}

function buildEndpointUrl(baseUrl, endpointPath, pageNumber) {
  const normalisedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const endpointUrl = new URL(endpointPath.replace(/^\/+/, ''), normalisedBase);
  if (pageNumber !== undefined) {
    endpointUrl.searchParams.set('page', String(pageNumber));
  }
  return endpointUrl.toString();
}

async function fetchEndpointPage(endpointPath, pageNumber) {
  const url = buildEndpointUrl(serviceUrl, endpointPath, pageNumber);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchAllEndpointData(endpointPath) {
  const aggregatedData = [];
  let currentPage = 1;
  let lastPagination = null;

  while (true) {
    const pagePayload = await fetchEndpointPage(endpointPath, currentPage);
    const { data = [], pagination = {} } = pagePayload;

    aggregatedData.push(...data);
    lastPagination = pagination;

    const { totalPages, page = currentPage, perPage } = pagination;
    const hasMorePages = Number.isFinite(totalPages)
      ? page < totalPages
      : data.length > 0 && Number.isFinite(perPage) && data.length === perPage;

    if (!hasMorePages) {
      break;
    }

    currentPage += 1;
  }

  return {
    data: aggregatedData,
    pagination: {
      totalItems: lastPagination && Number.isFinite(lastPagination.totalItems)
        ? lastPagination.totalItems
        : aggregatedData.length,
      totalPages: lastPagination && Number.isFinite(lastPagination.totalPages)
        ? lastPagination.totalPages
        : currentPage,
      perPage: lastPagination && Number.isFinite(lastPagination.perPage)
        ? lastPagination.perPage
        : aggregatedData.length > 0
        ? Math.ceil(aggregatedData.length / currentPage)
        : 0,
      fetchedPages: currentPage
    }
  };
}

async function persistEndpointData(endpointPath, payload, timestamp, snapshotDir) {
  const endpointName = sanitiseEndpointName(endpointPath);
  const filePath = path.join(snapshotDir, `${endpointName}.json`);
  const filePayload = {
    fetchedAt: timestamp,
    endpoint: endpointPath,
    serviceUrl,
    pagination: payload.pagination,
    data: payload.data
  };

  await fs.promises.writeFile(filePath, JSON.stringify(filePayload, null, 2), 'utf8');
  verboseInfo(`CRM data for ${endpointPath} persisted to ${filePath}`);
}

async function fetchCrmData(endpoints) {
  const runStartedAt = new Date();
  const timestamp = runStartedAt.toISOString().replace(/[.:]/g, '-');
  const snapshotDir = path.join(outputDir, timestamp);
  await ensureDirectory(snapshotDir);
  console.info(`Starting CRM ingestion cycle at ${runStartedAt.toISOString()} (snapshot ${snapshotDir})...`);

  for (const endpointPath of endpoints) {
    try {
      const payload = await fetchAllEndpointData(endpointPath);
      await persistEndpointData(endpointPath, payload, timestamp, snapshotDir);
    } catch (error) {
      console.error(`Failed to ingest data for ${endpointPath}:`, error);
    }
  }
}

let pollingHandle = null;
let shuttingDown = false;
let currentCyclePromise = Promise.resolve();

async function start() {
  await ensureDirectory(outputDir);
  verboseInfo(`Configured ${CRM_ENDPOINTS.length} CRM endpoint(s).`);

  const executeCycle = () => fetchCrmData(CRM_ENDPOINTS);

  currentCyclePromise = executeCycle();
  await currentCyclePromise;

  if (shuttingDown) {
    return;
  }

  pollingHandle = setInterval(() => {
    if (shuttingDown) {
      return;
    }
    currentCyclePromise = currentCyclePromise
      .catch(() => {})
      .then(() =>
        executeCycle().catch((error) => {
          console.error('Error inesperado en el ciclo de ingesta del CRM:', error);
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

      console.log(`Recibida señal ${signal}, deteniendo ingesta del CRM...`);

      if (pollingHandle) {
        clearInterval(pollingHandle);
        pollingHandle = null;
      }

      currentCyclePromise
        .catch((error) => {
          console.error('Error en el ciclo de ingesta del CRM durante el apagado:', error);
        })
        .finally(() => {
          process.exit(0);
        });
    });
  }
}

setupSignalHandlers();

start()
  .catch((error) => {
    console.error('Fatal error starting CRM ingestion script:', error);
    process.exit(1);
  });
