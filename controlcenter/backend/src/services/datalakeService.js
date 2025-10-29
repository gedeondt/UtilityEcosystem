import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATALAKE_ROOT =
  process.env.DATALAKE_ROOT || path.resolve(__dirname, '..', '..', '..', '..', 'datalake', 'data');

const DATALAKE_FOLDERS = ['landing', 'bronce', 'silver', 'gold'];
const GOLD_HOURLY_CONSUMPTION_FILE =
  process.env.GOLD_HOURLY_CONSUMPTION_FILE ||
  path.resolve(DATALAKE_ROOT, 'gold', 'controlcenter', 'hourly_average_consumption.json');

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
          fileCount: await countFilesRecursively(folderPath)
        };
      } catch (error) {
        if (error.code === 'ENOENT') {
          return {
            name: folderName,
            fileCount: 0
          };
        }

        throw error;
      }
    })
  );

  return stats;
}

function normalizeNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function mapSummary(rawSummary, rows) {
  const totalFromRows = rows.reduce((acc, row) => acc + (row.measurementCount ?? 0), 0);

  const totalMeasurements =
    normalizeNumber(
      rawSummary?.totalMeasurements ??
        rawSummary?.total_measurements ??
        rawSummary?.measurementCount ??
        rawSummary?.measurement_count
    ) ?? totalFromRows;

  const distinctContracts =
    normalizeNumber(
      rawSummary?.distinctContracts ??
        rawSummary?.distinct_contracts ??
        rawSummary?.contractCount ??
        rawSummary?.contract_count
    ) ?? 0;

  const distinctReadingDates =
    normalizeNumber(
      rawSummary?.distinctReadingDates ??
        rawSummary?.distinct_reading_dates ??
        rawSummary?.readingDays ??
        rawSummary?.reading_days
    ) ?? 0;

  return {
    totalMeasurements,
    distinctContracts,
    distinctReadingDates
  };
}

function mapRow(rawRow) {
  const hour = normalizeNumber(rawRow?.hour ?? rawRow?.hour_of_day ?? rawRow?.HOUR ?? rawRow?.HOUR_OF_DAY);
  const averageConsumption = normalizeNumber(
    rawRow?.averageConsumptionKwh ??
      rawRow?.average_consumption_kwh ??
      rawRow?.avg_consumption_kwh ??
      rawRow?.AVG_CONSUMPTION_KWH
  );

  if (hour === null || averageConsumption === null) {
    return null;
  }

  const measurementCount = normalizeNumber(
    rawRow?.measurementCount ?? rawRow?.measurement_count ?? rawRow?.MEASUREMENT_COUNT
  );
  const contractCount = normalizeNumber(rawRow?.contractCount ?? rawRow?.contract_count ?? rawRow?.CONTRACT_COUNT);

  return {
    hour,
    averageConsumptionKwh: averageConsumption,
    measurementCount: measurementCount ?? null,
    contractCount: contractCount ?? null
  };
}

async function loadGoldHourlyConsumptionFile() {
  let raw;

  try {
    raw = await readFile(GOLD_HOURLY_CONSUMPTION_FILE, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      const notFoundError = new Error('Gold hourly average consumption dataset not found');
      notFoundError.code = 'ENOENT';
      throw notFoundError;
    }

    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const parsingError = new Error('Gold hourly average consumption dataset is not valid JSON');
    parsingError.cause = error;
    throw parsingError;
  }
}

export async function getAverageConsumptionByHour() {
  const payload = await loadGoldHourlyConsumptionFile();
  const rowsSource = Array.isArray(payload?.rows) ? payload.rows : Array.isArray(payload) ? payload : [];

  const rows = rowsSource.map(mapRow).filter((row) => row !== null).sort((a, b) => a.hour - b.hour);

  let generatedAt = payload?.generatedAt ?? null;
  if (!generatedAt) {
    try {
      const fileStats = await stat(GOLD_HOURLY_CONSUMPTION_FILE);
      generatedAt = fileStats.mtime.toISOString();
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  const summary = mapSummary(payload?.summary, rows);

  return {
    generatedAt,
    summary,
    source: payload?.source ?? null,
    rows
  };
}
