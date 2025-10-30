const http = require('http');
const https = require('https');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const POLL_INTERVAL_MS = (() => {
  const envValue = Number(process.env.CRM_ECOMMERCE_POLL_INTERVAL_MS);
  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.floor(envValue);
  }
  return 5_000;
})();
const MAX_EVENTS_PER_POLL = (() => {
  const envValue = Number(process.env.CRM_ECOMMERCE_MAX_PER_POLL);
  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.floor(envValue);
  }
  const arg = Number(process.argv[2]);
  return Number.isFinite(arg) && arg > 0 ? Math.floor(arg) : null;
})();
const MAX_CLIENTS = (() => {
  const envValue = Number(process.env.CRM_MAX_CLIENTS);
  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.floor(envValue);
  }
  const arg = Number(process.argv[3]);
  return Number.isFinite(arg) && arg > 0 ? Math.floor(arg) : null;
})();
const EVENTLOG_ENDPOINT = process.env.CRM_EVENTLOG_ENDPOINT || process.env.EVENTLOG_ENDPOINT || 'http://localhost:3050/events';
const ECOMMERCE_CHANNEL = process.env.CRM_ECOMMERCE_CHANNEL || process.env.ECOMMERCE_CHANNEL || 'ecommerce';
const CLIENTAPP_CHANNEL = process.env.CRM_CLIENTAPP_CHANNEL || 'clientapp';
const INITIAL_FROM = process.env.CRM_ECOMMERCE_FROM || null;
const CLIENTAPP_INITIAL_FROM = process.env.CRM_CLIENTAPP_FROM || null;
const CLIENTAPP_POLL_INTERVAL_MS = (() => {
  const envValue = Number(process.env.CRM_CLIENTAPP_POLL_INTERVAL_MS);
  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.floor(envValue);
  }
  return 30_000;
})();
const CLIENTAPP_MAX_EVENTS_PER_POLL = (() => {
  const envValue = Number(process.env.CRM_CLIENTAPP_MAX_PER_POLL);
  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.floor(envValue);
  }
  return null;
})();
const isVerbose = process.env.TE_VERBOSE === 'true';

const eventlogUrl = new URL(EVENTLOG_ENDPOINT);
const httpClient = eventlogUrl.protocol === 'https:' ? https : http;

const clients = [];
const billingAccounts = [];
const supplyPoints = [];
const contracts = [];

const verboseLog = (...args) => {
  if (isVerbose) {
    console.log('[crm]', ...args);
  }
};

function sendJson(res, data) {
  const payload = JSON.stringify(data, null, 2);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ message: 'Recurso no encontrado' }));
}

function handleGetCollection(res, collection, url) {
  const pageParam = Number(url.searchParams.get('page'));
  const perPageParam = Number(url.searchParams.get('perPage'));

  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const perPage = Number.isFinite(perPageParam) && perPageParam > 0 ? Math.floor(perPageParam) : 25;

  const totalItems = collection.length;
  const totalPages = perPage > 0 ? Math.ceil(totalItems / perPage) : 0;
  const start = (page - 1) * perPage;
  const paginatedItems = start >= 0 ? collection.slice(start, start + perPage) : [];

  sendJson(res, {
    data: paginatedItems,
    pagination: {
      page,
      perPage,
      totalItems,
      totalPages
    }
  });
}

function addUniqueById(collection, item) {
  if (!item || typeof item !== 'object' || !item.id) {
    return false;
  }
  const exists = collection.some((current) => current.id === item.id);
  if (exists) {
    return false;
  }
  collection.push(item);
  return true;
}

function registerBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    return false;
  }
  const { client, billingAccount, supplyPoint, contract } = bundle;

  if (!client?.id || !billingAccount?.id || !supplyPoint?.id || !contract?.id) {
    console.error('Evento e-commerce con estructura inválida. Ignorando.');
    return false;
  }

  const isExistingClient = clients.some((current) => current.id === client.id);

  if (!isExistingClient) {
    if (MAX_CLIENTS !== null && clients.length >= MAX_CLIENTS) {
      verboseLog('Límite máximo de clientes alcanzado. Ignorando nuevo pedido.');
      return false;
    }
    clients.push(client);
  }

  addUniqueById(billingAccounts, billingAccount);
  addUniqueById(supplyPoints, supplyPoint);
  addUniqueById(contracts, contract);

  return !isExistingClient;
}

function normalizeProductId(name) {
  if (typeof name !== 'string') {
    return null;
  }
  return name
    .normalize('NFD')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function applyProductChangeEvent(event) {
  if (!event || event.eventType !== 'contract.product_change') {
    return false;
  }

  const { contractId, product, pricing, effectiveAt } = event;
  if (!contractId) {
    return false;
  }

  const contract = contracts.find((item) => item.id === contractId);
  if (!contract) {
    verboseLog(`[clientapp] Evento para contrato desconocido ${contractId}.`);
    return false;
  }

  let updated = false;

  if (product && product.next) {
    const nextId = product.next.id || normalizeProductId(product.next.name || '');
    if (nextId) {
      contract.productId = nextId;
      updated = true;
    }
    if (typeof product.next.name === 'string' && product.next.name.trim().length > 0) {
      contract.tariff = product.next.name.trim();
      updated = true;
    }
  }

  if (pricing) {
    if (pricing.pricePerKWh) {
      const nextPrice = toNumber(pricing.pricePerKWh.next);
      if (nextPrice !== null) {
        contract.pricePerKWh = Number(nextPrice.toFixed(4));
        updated = true;
      }
    }
    if (pricing.fixedFeeEurMonth) {
      const nextFee = toNumber(pricing.fixedFeeEurMonth.next);
      if (nextFee !== null) {
        contract.fixedFeeEurMonth = Number(nextFee.toFixed(2));
        updated = true;
      }
    }
  }

  if (!updated) {
    return false;
  }

  const appliedAt = effectiveAt && !Number.isNaN(Date.parse(effectiveAt)) ? effectiveAt : new Date().toISOString();
  contract.lastProductChangeAt = appliedAt;
  contract.updatedAt = new Date().toISOString();

  verboseLog(
    `[clientapp] Actualizado contrato ${contract.id} a producto ${contract.tariff} (precio ${contract.pricePerKWh} €/kWh).`
  );

  return true;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = httpClient.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`Event Log respondió con código ${res.statusCode}`);
            error.response = text;
            reject(error);
            return;
          }
          try {
            resolve(text.length ? JSON.parse(text) : []);
          } catch (error) {
            reject(new Error('Respuesta JSON inválida desde Event Log'));
          }
        });
      }
    );

    request.on('error', (error) => reject(error));
    request.end();
  });
}

let ecommerceLastProcessedAt = INITIAL_FROM;
let ecommerceLastProcessedIds = new Set();
let ecommercePolling = false;
let ecommercePollIntervalHandle = null;

let clientappLastProcessedAt = CLIENTAPP_INITIAL_FROM;
let clientappLastProcessedIds = new Set();
let clientappPolling = false;
let clientappPollIntervalHandle = null;

async function pollEcommerce() {
  if (ecommercePolling) {
    return;
  }
  if (MAX_CLIENTS !== null && clients.length >= MAX_CLIENTS) {
    if (ecommercePollIntervalHandle) {
      clearInterval(ecommercePollIntervalHandle);
      ecommercePollIntervalHandle = null;
    }
    verboseLog('Capacidad máxima alcanzada, deteniendo polling de e-commerce.');
    return;
  }

  ecommercePolling = true;
  try {
    const url = new URL(eventlogUrl.toString());
    url.searchParams.set('channel', ECOMMERCE_CHANNEL);
    if (ecommerceLastProcessedAt) {
      url.searchParams.set('from', ecommerceLastProcessedAt);
    }

    const events = await requestJson(url);
    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    const lastTimestampMs = ecommerceLastProcessedAt ? Date.parse(ecommerceLastProcessedAt) : null;
    const processedIdsForLatest = new Set(
      Number.isNaN(lastTimestampMs) || lastTimestampMs === null
        ? []
        : Array.from(ecommerceLastProcessedIds)
    );
    let latestTimestampMs = Number.isNaN(lastTimestampMs) ? null : lastTimestampMs;
    let processedCount = 0;

    for (const event of events) {
      if (MAX_EVENTS_PER_POLL !== null && processedCount >= MAX_EVENTS_PER_POLL) {
        break;
      }

      if (!event || typeof event.id !== 'string' || typeof event.createdAt !== 'string') {
        continue;
      }

      const eventTimestamp = Date.parse(event.createdAt);
      if (Number.isNaN(eventTimestamp)) {
        continue;
      }

      if (ecommerceLastProcessedAt) {
        const lastTimestamp = Date.parse(ecommerceLastProcessedAt);
        if (!Number.isNaN(lastTimestamp)) {
          if (eventTimestamp < lastTimestamp) {
            continue;
          }
          if (eventTimestamp === lastTimestamp && ecommerceLastProcessedIds.has(event.id)) {
            continue;
          }
        }
      }

      let payload;
      try {
        payload = JSON.parse(event.payload);
      } catch (error) {
        console.error('Payload de evento e-commerce inválido. Ignorando.');
        continue;
      }

      registerBundle(payload);
      processedCount += 1;

      if (latestTimestampMs === null || eventTimestamp > latestTimestampMs) {
        latestTimestampMs = eventTimestamp;
        processedIdsForLatest.clear();
        processedIdsForLatest.add(event.id);
      } else if (eventTimestamp === latestTimestampMs) {
        processedIdsForLatest.add(event.id);
      }
    }

    if (processedCount > 0 && latestTimestampMs !== null) {
      ecommerceLastProcessedAt = new Date(latestTimestampMs).toISOString();
      ecommerceLastProcessedIds = processedIdsForLatest;
      verboseLog(`Procesados ${processedCount} evento(s) de e-commerce. Total clientes: ${clients.length}.`);
    }
  } catch (error) {
    console.error('Error durante el polling de e-commerce:', error.message);
  } finally {
    ecommercePolling = false;
  }
}

async function pollClientapp() {
  if (clientappPolling) {
    return;
  }

  clientappPolling = true;
  try {
    const url = new URL(eventlogUrl.toString());
    url.searchParams.set('channel', CLIENTAPP_CHANNEL);
    if (clientappLastProcessedAt) {
      url.searchParams.set('from', clientappLastProcessedAt);
    }

    const events = await requestJson(url);
    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    const lastTimestampMs = clientappLastProcessedAt ? Date.parse(clientappLastProcessedAt) : null;
    const processedIdsForLatest = new Set(
      Number.isNaN(lastTimestampMs) || lastTimestampMs === null
        ? []
        : Array.from(clientappLastProcessedIds)
    );
    let latestTimestampMs = Number.isNaN(lastTimestampMs) ? null : lastTimestampMs;
    let processedCount = 0;

    for (const event of events) {
      if (CLIENTAPP_MAX_EVENTS_PER_POLL !== null && processedCount >= CLIENTAPP_MAX_EVENTS_PER_POLL) {
        break;
      }

      if (!event || typeof event.id !== 'string' || typeof event.createdAt !== 'string') {
        continue;
      }

      const eventTimestamp = Date.parse(event.createdAt);
      if (Number.isNaN(eventTimestamp)) {
        continue;
      }

      if (clientappLastProcessedAt) {
        const lastTimestamp = Date.parse(clientappLastProcessedAt);
        if (!Number.isNaN(lastTimestamp)) {
          if (eventTimestamp < lastTimestamp) {
            continue;
          }
          if (eventTimestamp === lastTimestamp && clientappLastProcessedIds.has(event.id)) {
            continue;
          }
        }
      }

      let payload;
      try {
        payload = JSON.parse(event.payload);
      } catch (error) {
        console.error('Payload de evento clientapp inválido. Ignorando.');
        continue;
      }

      const applied = applyProductChangeEvent(payload);
      if (!applied) {
        continue;
      }

      processedCount += 1;

      if (latestTimestampMs === null || eventTimestamp > latestTimestampMs) {
        latestTimestampMs = eventTimestamp;
        processedIdsForLatest.clear();
        processedIdsForLatest.add(event.id);
      } else if (eventTimestamp === latestTimestampMs) {
        processedIdsForLatest.add(event.id);
      }
    }

    if (processedCount > 0 && latestTimestampMs !== null) {
      clientappLastProcessedAt = new Date(latestTimestampMs).toISOString();
      clientappLastProcessedIds = processedIdsForLatest;
      verboseLog(`Procesados ${processedCount} evento(s) de clientapp.`);
    }
  } catch (error) {
    console.error('Error durante el polling de clientapp:', error.message);
  } finally {
    clientappPolling = false;
  }
}

const server = http.createServer((req, res) => {
  const { method } = req;
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ message: 'Método no permitido' }));
    return;
  }

  switch (url.pathname) {
    case '/clients':
      handleGetCollection(res, clients, url);
      return;
    case '/billing-accounts':
      handleGetCollection(res, billingAccounts, url);
      return;
    case '/supply-points':
      handleGetCollection(res, supplyPoints, url);
      return;
    case '/contracts':
      handleGetCollection(res, contracts, url);
      return;
    default:
      notFound(res);
  }
});

server.listen(PORT, () => {
  console.log(`CRM escuchando en http://localhost:${PORT}`);
  verboseLog(
    `Iniciando polling de e-commerce cada ${Math.round(POLL_INTERVAL_MS / 1000)} segundos (máx. ${
      MAX_EVENTS_PER_POLL === null ? 'sin límite' : MAX_EVENTS_PER_POLL
    } evento(s) por ciclo).`
  );
  pollEcommerce();
  ecommercePollIntervalHandle = setInterval(() => {
    pollEcommerce();
  }, POLL_INTERVAL_MS);

  verboseLog(
    `Iniciando polling de clientapp cada ${Math.round(CLIENTAPP_POLL_INTERVAL_MS / 1000)} segundos (máx. ${
      CLIENTAPP_MAX_EVENTS_PER_POLL === null ? 'sin límite' : CLIENTAPP_MAX_EVENTS_PER_POLL
    } evento(s) por ciclo).`
  );
  pollClientapp();
  clientappPollIntervalHandle = setInterval(() => {
    pollClientapp();
  }, CLIENTAPP_POLL_INTERVAL_MS);
});

const signals = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, () => {
    console.log(`Recibida señal ${signal}, cerrando CRM...`);
    if (ecommercePollIntervalHandle) {
      clearInterval(ecommercePollIntervalHandle);
    }
    if (clientappPollIntervalHandle) {
      clearInterval(clientappPollIntervalHandle);
    }
    server.close(() => {
      process.exit(0);
    });
  });
});
