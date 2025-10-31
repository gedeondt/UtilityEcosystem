const fsp = require('fs/promises');
const path = require('path');

const {
  parseArgs,
  getRequiredString,
  getRequiredPositiveInteger,
  hasFlag
} = require('../../lib/cli');

const isVerbose = process.env.TE_VERBOSE === 'true';
const verboseInfo = (...args) => {
  if (isVerbose) {
    console.info(...args);
  }
};

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

function sanitizeProductId(value) {
  return (value || 'producto-desconocido')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'producto-desconocido';
}

function normalizeString(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return fallback;
  }

  return normalized;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function extractContracts(payload) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  if (Array.isArray(payload.contracts)) {
    return payload.contracts;
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  return [];
}

function getClientId(contract) {
  return (
    normalizeString(contract?.clientId) ||
    normalizeString(contract?.client_id) ||
    normalizeString(contract?.CLIENT_ID)
  );
}

function getTariffName(contract) {
  return (
    normalizeString(contract?.tariff) ||
    normalizeString(contract?.productName) ||
    normalizeString(contract?.product_name) ||
    normalizeString(contract?.PRODUCT_NAME) ||
    'Producto sin nombre'
  );
}

function getStatus(contract) {
  const status =
    normalizeString(contract?.status) ||
    normalizeString(contract?.contractStatus) ||
    normalizeString(contract?.contract_status) ||
    normalizeString(contract?.STATUS) ||
    'DESCONOCIDO';
  return status.toUpperCase();
}

function getPricePerKwh(contract) {
  return (
    normalizeNumber(contract?.pricePerKWh) ??
    normalizeNumber(contract?.price_per_kwh) ??
    normalizeNumber(contract?.PRICE_PER_KWH)
  );
}

function getFixedFee(contract) {
  return (
    normalizeNumber(contract?.fixedFeeEurMonth) ??
    normalizeNumber(contract?.fixed_fee_eur_month) ??
    normalizeNumber(contract?.FIXED_FEE_EUR_MONTH)
  );
}

function computeCustomersByProduct(contracts) {
  const groups = new Map();
  const globalClients = new Set();

  for (const contract of contracts) {
    const productName = getTariffName(contract);
    const productId = sanitizeProductId(productName);
    const status = getStatus(contract);
    const clientId = getClientId(contract);
    const pricePerKwh = getPricePerKwh(contract);
    const fixedFee = getFixedFee(contract);

    if (!groups.has(productId)) {
      groups.set(productId, {
        productId,
        productName,
        contractCount: 0,
        activeContractCount: 0,
        inactiveContractCount: 0,
        clientIds: new Set(),
        priceSum: 0,
        priceCount: 0,
        fixedFeeSum: 0,
        fixedFeeCount: 0
      });
    }

    const group = groups.get(productId);
    group.contractCount += 1;

    if (status === 'VIGENTE' || status === 'ACTIVE' || status === 'ACTIVO') {
      group.activeContractCount += 1;
    } else {
      group.inactiveContractCount += 1;
    }

    if (clientId) {
      group.clientIds.add(clientId);
      globalClients.add(clientId);
    }

    if (pricePerKwh !== null) {
      group.priceSum += pricePerKwh;
      group.priceCount += 1;
    }

    if (fixedFee !== null) {
      group.fixedFeeSum += fixedFee;
      group.fixedFeeCount += 1;
    }
  }

  const rows = Array.from(groups.values())
    .map((group) => ({
      productId: group.productId,
      productName: group.productName,
      clientCount: group.clientIds.size,
      contractCount: group.contractCount,
      activeContractCount: group.activeContractCount,
      inactiveContractCount: group.inactiveContractCount,
      averagePricePerKwh:
        group.priceCount > 0 ? Number((group.priceSum / group.priceCount).toFixed(5)) : null,
      averageFixedFeeEurMonth:
        group.fixedFeeCount > 0 ? Number((group.fixedFeeSum / group.fixedFeeCount).toFixed(2)) : null
    }))
    .sort((a, b) => {
      if (b.clientCount !== a.clientCount) {
        return b.clientCount - a.clientCount;
      }
      return a.productName.localeCompare(b.productName, undefined, { sensitivity: 'base' });
    });

  const summary = {
    totalProducts: rows.length,
    totalContracts: rows.reduce((acc, row) => acc + row.contractCount, 0),
    distinctClients: globalClients.size,
    activeContracts: rows.reduce((acc, row) => acc + row.activeContractCount, 0),
    inactiveContracts: rows.reduce((acc, row) => acc + row.inactiveContractCount, 0)
  };

  return { rows, summary };
}

let lastSignature = null;
let intervalHandle = null;
let shuttingDown = false;

async function processCycle({ inputFile, outputFile }) {
  const exists = await fileExists(inputFile);
  if (!exists) {
    lastSignature = null;
    console.warn(`No se encontró el dataset Bronze de contratos en ${inputFile}. Se omitirá este ciclo.`);
    return;
  }

  let payload;
  try {
    const raw = await fsp.readFile(inputFile, 'utf8');
    payload = JSON.parse(raw);
  } catch (error) {
    console.error('No se pudo leer el dataset Bronze de contratos:', error);
    return;
  }

  const contracts = extractContracts(payload);
  const { rows, summary } = computeCustomersByProduct(contracts);

  const signaturePayload = {
    rows,
    summary,
    source: {
      snapshot: payload?.snapshot ?? null,
      refreshedAt: payload?.refreshedAt ?? null,
      totalItems: payload?.totalItems ?? null
    }
  };

  const signature = JSON.stringify(signaturePayload);
  if (signature === lastSignature) {
    verboseInfo('El dataset Gold de clientes por producto ya está actualizado.');
    return;
  }

  lastSignature = signature;

  const dataset = {
    generatedAt: new Date().toISOString(),
    source: {
      bronzeFile: inputFile,
      snapshot: payload?.snapshot ?? null,
      refreshedAt: payload?.refreshedAt ?? null,
      totalItems: payload?.totalItems ?? contracts.length
    },
    summary,
    rows
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
      console.log(`Recibida señal ${signal}, deteniendo generación de clientes por producto...`);

      if (intervalHandle) {
        clearInterval(intervalHandle);
      }

      process.exit(0);
    });
  }
}

async function main() {
  setupSignalHandlers();

  verboseInfo(`Fichero de entrada (Bronze contratos): ${options.inputFile}`);
  verboseInfo(`Fichero de salida (Gold clientes por producto): ${options.outputFile}`);
  verboseInfo(`Intervalo de sondeo: ${Math.round(options.intervalMs / 1000)} segundos.`);

  console.info('Iniciando generación del mart de clientes por producto en Gold...');

  if (options.runOnce) {
    await processCycle(options);
    return;
  }

  const executeCycle = () => {
    processCycle(options).catch((error) => {
      console.error('Error inesperado durante la generación del dataset Gold de clientes por producto:', error);
    });
  };

  await executeCycle();
  intervalHandle = setInterval(executeCycle, options.intervalMs);
}

main().catch((error) => {
  console.error('Error fatal al iniciar la generación del dataset Gold de clientes por producto:', error);
  process.exit(1);
});
