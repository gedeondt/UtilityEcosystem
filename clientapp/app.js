const http = require('http');
const https = require('https');

const { createVerboseLogger } = require('../lib/logger');
const { slugify } = require('../lib/strings');
const { toNumber } = require('../lib/numbers');
const { createJsonRequester } = require('../lib/http');

const EVENTLOG_ENDPOINT =
  process.env.CLIENTAPP_EVENTLOG_ENDPOINT || process.env.EVENTLOG_ENDPOINT || 'http://localhost:3050/events';
const CRM_ENDPOINT = process.env.CLIENTAPP_CRM_ENDPOINT || 'http://localhost:3000/contracts';
const CHANNEL = process.env.CLIENTAPP_CHANNEL || 'clientapp';
const INTERVAL_MS = (() => {
  const envValue = Number(process.env.CLIENTAPP_INTERVAL_MS);
  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.floor(envValue);
  }
  return 30_000;
})();
const MAX_UPDATES = (() => {
  const envValue = Number(process.env.CLIENTAPP_MAX_UPDATES);
  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.floor(envValue);
  }
  return 5;
})();
const PAGE_SIZE = (() => {
  const envValue = Number(process.env.CLIENTAPP_PAGE_SIZE);
  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.floor(envValue);
  }
  return 100;
})();
const eventlogUrl = new URL(EVENTLOG_ENDPOINT);
const crmUrl = new URL(CRM_ENDPOINT);

const eventlogHttpClient = eventlogUrl.protocol === 'https:' ? https : http;
const crmHttpClient = crmUrl.protocol === 'https:' ? https : http;

const requestEventlogJson = createJsonRequester(eventlogHttpClient);
const requestCrmJson = createJsonRequester(crmHttpClient);

const productCatalog = [
  { id: 'tarifa-plana-24h', name: 'Tarifa Plana 24h' },
  { id: 'tarifa-horaria', name: 'Tarifa Horaria' },
  { id: 'tarifa-nocturna', name: 'Tarifa Nocturna' }
];

const verboseLog = createVerboseLogger('clientapp');

async function fetchAllContracts() {
  const contracts = [];
  let page = 1;

  while (true) {
    const pageUrl = new URL(crmUrl.toString());
    pageUrl.searchParams.set('page', String(page));
    pageUrl.searchParams.set('perPage', String(PAGE_SIZE));

    let response;
    try {
      response = await requestCrmJson(pageUrl);
    } catch (error) {
      console.error('No se pudo recuperar contratos del CRM:', error.message);
      return contracts;
    }

    if (!response || typeof response !== 'object' || !Array.isArray(response.data)) {
      break;
    }

    contracts.push(...response.data);
    const { pagination } = response;
    if (!pagination || page >= Number(pagination.totalPages || 0)) {
      break;
    }

    page += 1;
  }

  return contracts;
}

function pickRandomSubset(items, count) {
  const indices = items.map((_, index) => index);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const result = [];
  for (let i = 0; i < Math.min(count, indices.length); i += 1) {
    result.push(items[indices[i]]);
  }
  return result;
}

function randomBetween(min, max) {
  return Number((min + Math.random() * (max - min)).toFixed(4));
}

function chooseNextProduct(currentProductId) {
  const alternatives = productCatalog.filter((product) => product.id !== currentProductId);
  if (alternatives.length === 0) {
    return null;
  }
  return alternatives[Math.floor(Math.random() * alternatives.length)];
}

function buildProductChangeEvent(contract) {
  if (!contract || !contract.id) {
    return null;
  }

  const currentProductId = contract.productId || slugify(contract.tariff || '') || 'unknown';
  const currentProduct = productCatalog.find((product) => product.id === currentProductId) || {
    id: currentProductId,
    name: contract.tariff || 'Producto desconocido'
  };

  const nextProduct = chooseNextProduct(currentProduct.id);
  if (!nextProduct) {
    return null;
  }

  const newPrice = randomBetween(0.11, 0.19);
  const newFee = Number((5 + Math.random() * 10).toFixed(2));
  const previousPrice = toNumber(contract.pricePerKWh);
  const previousFee = toNumber(contract.fixedFeeEurMonth);

  return {
    eventType: 'contract.product_change',
    version: 1,
    emittedAt: new Date().toISOString(),
    contractId: contract.id,
    clientId: contract.clientId,
    billingAccountId: contract.billingAccountId,
    supplyPointId: contract.supplyPointId,
    product: {
      previous: { id: currentProduct.id, name: contract.tariff },
      next: { id: nextProduct.id, name: nextProduct.name }
    },
    pricing: {
      pricePerKWh: {
        previous: previousPrice,
        next: newPrice
      },
      fixedFeeEurMonth: {
        previous: previousFee,
        next: Number(newFee.toFixed(2))
      }
    },
    effectiveAt: new Date(Date.now() + 60_000).toISOString(),
    source: 'clientapp'
  };
}

async function publishEvent(payload) {
  try {
    await requestEventlogJson(eventlogUrl, {
      method: 'POST',
      body: { channel: CHANNEL, payload: JSON.stringify(payload) }
    });
    verboseLog(
      `Evento de cambio de producto publicado para contrato ${payload.contractId} → ${payload.product.next.name}`
    );
  } catch (error) {
    console.error('No se pudo publicar evento en Event Log:', error.message);
  }
}

async function runCycle() {
  const contracts = await fetchAllContracts();
  if (contracts.length === 0) {
    verboseLog('Sin contratos disponibles en CRM.');
    return;
  }

  const updatesToEmit = pickRandomSubset(contracts, MAX_UPDATES);
  if (updatesToEmit.length === 0) {
    verboseLog('No se seleccionaron contratos para actualización.');
    return;
  }

  verboseLog(`Generando ${updatesToEmit.length} cambio(s) de producto...`);
  for (const contract of updatesToEmit) {
    const event = buildProductChangeEvent(contract);
    if (!event) {
      continue;
    }
    await publishEvent(event);
  }
}

console.log(
  `Client App simulator activo. Intervalo ${Math.round(INTERVAL_MS / 1000)}s, máximo ${MAX_UPDATES} contratos por ciclo.`
);

runCycle();
const intervalHandle = setInterval(runCycle, INTERVAL_MS);

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, () => {
    console.log(`Recibida señal ${signal}, cerrando Client App simulator...`);
    clearInterval(intervalHandle);
    process.exit(0);
  });
}
