import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import duckdb from 'duckdb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATALAKE_ROOT =
  process.env.DATALAKE_ROOT || path.resolve(__dirname, '..', '..', '..', '..', 'datalake', 'data');

const DATALAKE_FOLDERS = ['landing', 'bronce', 'silver', 'gold'];
const SILVER_AVG_CONSUMPTION_FILE =
  process.env.SILVER_AVG_CONSUMPTION_FILE ||
  path.resolve(DATALAKE_ROOT, 'silver', 'avg_customer_consumption_by_hour.parquet');

const HOUR_COLUMN_CANDIDATES = ['hour', 'hour_of_day', 'hora', 'hora_dia'];
const CONSUMPTION_COLUMN_CANDIDATES = [
  'consumption_kwh',
  'avg_consumption_kwh',
  'average_consumption_kwh',
  'consumo_kwh',
  'consumo_medio_kwh',
];

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

function mapDuckDbErrorToNotFound(error) {
  if (!error) {
    return false;
  }

  const message = String(error.message || '').toLowerCase();
  return message.includes('no files found') || message.includes('failed to open file');
}

function executeAll(connection, query, params) {
  return new Promise((resolve, reject) => {
    connection.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows);
    });
  });
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function findColumn(schema, candidates) {
  const lookup = new Map();

  schema.forEach((column) => {
    if (column?.column_name) {
      lookup.set(String(column.column_name).toLowerCase(), column.column_name);
    }
  });

  for (const candidate of candidates) {
    if (lookup.has(candidate)) {
      return lookup.get(candidate);
    }
  }

  return null;
}

export async function getAverageConsumptionByHour() {
  const db = new duckdb.Database(':memory:');
  const connection = db.connect();

  try {
    const schema = await executeAll(
      connection,
      'DESCRIBE SELECT * FROM read_parquet(?)',
      [SILVER_AVG_CONSUMPTION_FILE]
    );

    const hourColumn = findColumn(schema, HOUR_COLUMN_CANDIDATES);
    const consumptionColumn = findColumn(schema, CONSUMPTION_COLUMN_CANDIDATES);

    if (!hourColumn || !consumptionColumn) {
      throw new Error('Silver hourly average consumption dataset does not match the expected schema');
    }

    const hourIdentifier = quoteIdentifier(hourColumn);
    const consumptionIdentifier = quoteIdentifier(consumptionColumn);

    const rows = await executeAll(
      connection,
      `
        SELECT
          ${hourIdentifier} AS hour_of_day,
          AVG(${consumptionIdentifier}) AS average_consumption_kwh
        FROM read_parquet(?)
        GROUP BY ${hourIdentifier}
        ORDER BY ${hourIdentifier}
      `,
      [SILVER_AVG_CONSUMPTION_FILE]
    );

    return rows
      .map((row) => {
        const hour =
          typeof row.hour_of_day === 'number'
            ? row.hour_of_day
            : Number.parseInt(row.hour_of_day ?? row.hour ?? row.HOUR, 10);
        const average = Number(row.average_consumption_kwh ?? row.AVERAGE_CONSUMPTION_KWH ?? 0);

        return {
          hour: Number.isNaN(hour) ? null : hour,
          averageConsumptionKwh: Number.isFinite(average) ? average : null,
        };
      })
      .filter((entry) => entry.hour !== null && entry.averageConsumptionKwh !== null);
  } catch (error) {
    if (mapDuckDbErrorToNotFound(error)) {
      const notFoundError = new Error('Silver hourly average consumption dataset not found');
      notFoundError.code = 'ENOENT';
      throw notFoundError;
    }

    throw error;
  } finally {
    connection.close();
  }
}
