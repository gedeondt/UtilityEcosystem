const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const DEFAULT_INTERVAL_MS = 3 * 60 * 1000;

const serviceUrl = process.env.CRM_SERVICE_URL || process.argv[2];
const outputDir = process.env.CRM_OUTPUT_DIR || process.argv[3] || path.resolve(__dirname, '..', 'data', 'landing', 'crm');
const intervalMs = Number(process.env.CRM_POLL_INTERVAL_MS || process.argv[4] || DEFAULT_INTERVAL_MS);

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

async function fetchCrmData() {
  const runStartedAt = new Date();
  console.info(`Starting CRM ingestion cycle at ${runStartedAt.toISOString()}...`);

  try {
    const response = await fetch(serviceUrl);

    if (!response.ok) {
      throw new Error(`CRM request failed with status ${response.status} ${response.statusText}`);
    }

    const rawBody = await response.text();
    let bodyToPersist = rawBody;

    try {
      const parsed = JSON.parse(rawBody);
      bodyToPersist = JSON.stringify(parsed, null, 2);
    } catch (parseError) {
      console.warn('CRM response is not valid JSON. Persisting raw payload.');
    }

    await ensureDirectory(outputDir);

    const timestamp = runStartedAt.toISOString().replace(/[.:]/g, '-');
    const filePath = path.join(outputDir, `crm-${timestamp}.json`);

    await fs.promises.writeFile(filePath, bodyToPersist, 'utf8');

    console.info(`CRM payload persisted to ${filePath}`);
  } catch (error) {
    console.error('CRM ingestion cycle failed:', error);
  }
}

async function start() {
  await ensureDirectory(outputDir);
  await fetchCrmData();
  setInterval(fetchCrmData, intervalMs).unref();
}

start().catch((error) => {
  console.error('Fatal error starting CRM ingestion script:', error);
  process.exit(1);
});
