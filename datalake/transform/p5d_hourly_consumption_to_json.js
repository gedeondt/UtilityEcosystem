const fsp = require('fs/promises');
const path = require('path');
const duckdb = require('duckdb');

const isVerbose = process.env.TE_VERBOSE === 'true';
const verboseInfo = (...args) => {
  if (isVerbose) {
    console.info(...args);
  }
};

const {
  parseArgs,
  getRequiredString,
  getRequiredPositiveInteger,
  hasFlag
} = require('../../lib/cli');

const cliOptions = parseArgs(process.argv);
const options = {
  inputFile: path.resolve(getRequiredString(cliOptions, 'input')),
  outputFile: path.resolve(getRequiredString(cliOptions, 'output')),
  intervalMs: getRequiredPositiveInteger(cliOptions, 'interval-ms'),
  runOnce: hasFlag(cliOptions, 'once')
};

async function ensureDirectory(directoryPath) {
  await fsp.mkdir(directoryPath, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function executeAll(connection, query, params = []) {
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

function normalizeNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric;
}

function mapRow(row) {
  const hour = normalizeNumber(
    row.hour ?? row.HOUR ?? row.hour_of_day ?? row.HOUR_OF_DAY ?? row.hourOfDay
  );
  const average = normalizeNumber(
    row.average_consumption_kwh ??
      row.AVERAGE_CONSUMPTION_KWH ??
      row.avg_consumption_kwh ??
      row.AVG_CONSUMPTION_KWH
  );
  const measurementCount = normalizeNumber(
    row.measurement_count ?? row.MEASUREMENT_COUNT ?? row.reading_count ?? row.READING_COUNT
  );
  const contractCount = normalizeNumber(
    row.contract_count ?? row.CONTRACT_COUNT ?? row.customer_count ?? row.CUSTOMER_COUNT
  );

  if (hour === null || average === null) {
    return null;
  }

  return {
    hour,
    averageConsumptionKwh: average,
    measurementCount: measurementCount ?? 0,
    contractCount: contractCount ?? 0
  };
}

function mapSummary(row) {
  const totalMeasurements = normalizeNumber(
    row.total_measurements ?? row.TOTAL_MEASUREMENTS ?? row.measurement_count ?? row.MEASUREMENT_COUNT
  );
  const distinctContracts = normalizeNumber(
    row.distinct_contracts ?? row.DISTINCT_CONTRACTS ?? row.contract_count ?? row.CONTRACT_COUNT
  );
  const distinctReadingDates = normalizeNumber(
    row.distinct_reading_dates ??
      row.DISTINCT_READING_DATES ??
      row.reading_days ??
      row.READING_DAYS
  );

  return {
    totalMeasurements: totalMeasurements ?? 0,
    distinctContracts: distinctContracts ?? 0,
    distinctReadingDates: distinctReadingDates ?? 0
  };
}

async function computeDataset(inputFile) {
  const db = new duckdb.Database(':memory:');
  const connection = db.connect();

  try {
    const hourlyRows = await executeAll(
      connection,
      `
        SELECT
          hour,
          AVG(consumption_kwh) AS average_consumption_kwh,
          COUNT(*) AS measurement_count,
          COUNT(DISTINCT contract_id) AS contract_count
        FROM read_parquet(?)
        GROUP BY hour
        ORDER BY hour
      `,
      [inputFile]
    );

    const summaryRows = await executeAll(
      connection,
      `
        SELECT
          COUNT(*) AS total_measurements,
          COUNT(DISTINCT contract_id) AS distinct_contracts,
          COUNT(DISTINCT reading_date) AS distinct_reading_dates
        FROM read_parquet(?)
      `,
      [inputFile]
    );

    return {
      rows: hourlyRows.map(mapRow).filter(Boolean),
      summary: mapSummary(summaryRows[0] || {})
    };
  } finally {
    connection.close();
  }
}

let intervalHandle = null;
let shuttingDown = false;
let lastSignature = null;
let lastSourceSize = null;

async function processCycle({ inputFile, outputFile }) {
  const exists = await fileExists(inputFile);

  if (!exists) {
    lastSignature = null;
    lastSourceSize = null;
    console.warn(`No se encontró el dataset Silver en ${inputFile}. Se omitirá este ciclo.`);
    return;
  }

  const sourceStats = await fsp.stat(inputFile);
  const { rows, summary } = await computeDataset(inputFile);
  const sortedRows = [...rows].sort((a, b) => a.hour - b.hour);

  const signaturePayload = {
    rows: sortedRows.map((row) => ({
      hour: row.hour,
      averageConsumptionKwh: row.averageConsumptionKwh,
      measurementCount: row.measurementCount,
      contractCount: row.contractCount
    })),
    summary,
    source: {
      mtimeMs: sourceStats.mtimeMs,
      size: sourceStats.size
    }
  };

  const signature = JSON.stringify(signaturePayload);

  if (signature === lastSignature && sourceStats.size === lastSourceSize) {
    verboseInfo('El dataset Gold ya está actualizado.');
    return;
  }

  lastSignature = signature;
  lastSourceSize = sourceStats.size;

  const dataset = {
    generatedAt: new Date().toISOString(),
    source: {
      parquetFile: inputFile,
      lastModifiedAt: new Date(sourceStats.mtimeMs).toISOString(),
      sizeBytes: sourceStats.size
    },
    summary,
    rows: sortedRows
  };

  await ensureDirectory(path.dirname(outputFile));
  await fsp.writeFile(outputFile, JSON.stringify(dataset, null, 2), 'utf8');
  console.info(`Dataset Gold actualizado: ${outputFile}`);
}

function setupSignalHandlers() {
  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, () => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      console.log(`Recibida señal ${signal}, deteniendo generación de consumo medio horario...`);

      if (intervalHandle) {
        clearInterval(intervalHandle);
      }

      process.exit(0);
    });
  }
}

async function main() {
  setupSignalHandlers();

  verboseInfo(`Fichero de entrada (Silver): ${options.inputFile}`);
  verboseInfo(`Fichero de salida (Gold): ${options.outputFile}`);
  verboseInfo(`Intervalo de sondeo: ${Math.round(options.intervalMs / 1000)} segundos.`);

  console.info('Iniciando generación de consumo medio horario en Gold...');

  if (options.runOnce) {
    await processCycle(options);
    return;
  }

  const executeCycle = () => {
    processCycle(options).catch((error) => {
      console.error('Error inesperado durante la generación del dataset Gold:', error);
    });
  };

  await executeCycle();
  intervalHandle = setInterval(executeCycle, options.intervalMs);
}

main().catch((error) => {
  console.error('Error fatal al iniciar la generación del dataset Gold:', error);
  process.exit(1);
});
