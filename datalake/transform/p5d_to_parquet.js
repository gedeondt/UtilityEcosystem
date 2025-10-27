const fsp = require('fs/promises');
const path = require('path');
const { ParquetSchema, ParquetWriter } = require('@dsnp/parquetjs');

const DEFAULT_INTERVAL_MS = 180_000;
const DEFAULT_INPUT_DIR = path.resolve(__dirname, '..', 'data', 'landing', 'ftp');
const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, '..', 'data', 'silver', 'p5d');
const DEFAULT_OUTPUT_FILE = path.join(DEFAULT_OUTPUT_DIR, 'p5d_readings.parquet');
const STATE_FILE = path.resolve(__dirname, '.p5d_transform_state.json');

function parseCliArgs(argv) {
  const options = {
    inputDir: DEFAULT_INPUT_DIR,
    outputFile: DEFAULT_OUTPUT_FILE,
    intervalMs: DEFAULT_INTERVAL_MS
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }

    const key = arg.slice(2);
    const value = argv[i + 1];

    switch (key) {
      case 'input':
        if (!value) {
          throw new Error('El argumento --input requiere una ruta.');
        }
        options.inputDir = path.resolve(process.cwd(), value);
        i += 1;
        break;
      case 'output':
        if (!value) {
          throw new Error('El argumento --output requiere una ruta.');
        }
        options.outputFile = path.resolve(process.cwd(), value);
        i += 1;
        break;
      case 'interval-ms': {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error('El argumento --interval-ms debe ser un número positivo.');
        }
        options.intervalMs = parsed;
        i += 1;
        break;
      }
      default:
        throw new Error(`Argumento no reconocido: --${key}`);
    }
  }

  return options;
}

async function ensureDirectory(directoryPath) {
  await fsp.mkdir(directoryPath, { recursive: true });
}

async function loadState() {
  try {
    const raw = await fsp.readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.processed)) {
      return new Set(parsed.processed);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('No se pudo leer el fichero de estado, se iniciará vacío:', error.message);
    }
  }
  return new Set();
}

async function persistState(processedSet) {
  const payload = JSON.stringify({ processed: Array.from(processedSet) }, null, 2);
  await fsp.writeFile(STATE_FILE, payload, 'utf8');
}

async function listFilesRecursively(directory) {
  const discovered = [];
  let entries;
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return discovered;
    }
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFilesRecursively(fullPath);
      discovered.push(...nested);
    } else if (entry.isFile() && entry.name.toUpperCase().startsWith('P5D') && entry.name.endsWith('.txt')) {
      discovered.push(fullPath);
    }
  }

  return discovered;
}

function parseP5DFile(content, sourcePath) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('El fichero P5D no contiene datos suficientes.');
  }

  const [header, ...dataLines] = lines;
  const headerParts = header.split('|');
  if (headerParts.length < 4) {
    throw new Error('Cabecera P5D inválida.');
  }

  const [, contractId, readingDate, supplyPointId] = headerParts;

  const records = [];
  dataLines.forEach((line) => {
    const [hourPart, consumptionPart] = line.split(';');
    if (!hourPart || !consumptionPart) {
      throw new Error(`Línea de datos inválida: "${line}"`);
    }

    const hour = Number.parseInt(hourPart, 10);
    const consumption = Number.parseFloat(consumptionPart.replace(',', '.'));
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new Error(`Hora inválida en la línea: "${line}"`);
    }
    if (!Number.isFinite(consumption)) {
      throw new Error(`Consumo inválido en la línea: "${line}"`);
    }

    records.push({
      contract_id: contractId,
      reading_date: readingDate,
      supply_point_id: supplyPointId,
      hour,
      consumption_kwh: consumption,
      source_file: sourcePath
    });
  });

  return records;
}

function buildSchema() {
  return new ParquetSchema({
    contract_id: { type: 'UTF8' },
    reading_date: { type: 'UTF8' },
    supply_point_id: { type: 'UTF8' },
    hour: { type: 'INT32' },
    consumption_kwh: { type: 'DOUBLE' },
    source_file: { type: 'UTF8' }
  });
}

async function appendToParquet(records, outputFile, schema) {
  if (records.length === 0) {
    return;
  }

  const outputDir = path.dirname(outputFile);
  await ensureDirectory(outputDir);

  const writer = await ParquetWriter.openFile(schema, outputFile, { append: true });
  try {
    for (const record of records) {
      await writer.appendRow(record);
    }
  } finally {
    await writer.close();
  }
}

async function processCycle({ inputDir, outputFile, processedFiles, schema }) {
  const candidates = await listFilesRecursively(inputDir);
  const newFiles = candidates.filter((file) => !processedFiles.has(file));

  if (newFiles.length === 0) {
    console.info('No se encontraron nuevos ficheros P5D.');
    return;
  }

  console.info(`Procesando ${newFiles.length} fichero(s) P5D...`);
  const buffer = [];

  for (const filePath of newFiles) {
    try {
      const content = await fsp.readFile(filePath, 'utf8');
      const records = parseP5DFile(content, filePath);
      buffer.push(...records);
      processedFiles.add(filePath);
      console.info(`Fichero ${filePath} convertido a ${records.length} registros.`);
    } catch (error) {
      console.error(`No se pudo transformar el fichero ${filePath}:`, error.message);
    }
  }

  await appendToParquet(buffer, outputFile, schema);
  await persistState(processedFiles);

  if (buffer.length > 0) {
    console.info(`Se añadieron ${buffer.length} registros al dataset ${outputFile}.`);
  }
}

async function main() {
  let options;
  try {
    options = parseCliArgs(process.argv);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const schema = buildSchema();
  const processedFiles = await loadState();

  console.info('Iniciando transformación P5D → Parquet...');
  console.info(`Directorio de entrada: ${options.inputDir}`);
  console.info(`Fichero de salida: ${options.outputFile}`);
  console.info(`Intervalo de sondeo: ${Math.round(options.intervalMs / 1000)} segundos.`);

  const executeCycle = () => {
    processCycle({
      inputDir: options.inputDir,
      outputFile: options.outputFile,
      processedFiles,
      schema
    }).catch((error) => {
      console.error('Error inesperado en el ciclo de transformación:', error);
    });
  };

  await executeCycle();
  setInterval(executeCycle, options.intervalMs);
}

main().catch((error) => {
  console.error('Error fatal al iniciar el proceso de transformación:', error);
  process.exit(1);
});
