const http = require('http');
const https = require('https');
const { randomUUID } = require('crypto');

const { createVerboseLogger } = require('../lib/logger');
const { slugify } = require('../lib/strings');
const { createJsonRequester } = require('../lib/http');
const {
  parseArgs,
  getRequiredString,
  getRequiredPositiveInteger,
  getRequiredPositiveIntegerOrNull
} = require('../lib/cli');

const cliOptions = parseArgs(process.argv);
const EVENTLOG_ENDPOINT = getRequiredString(cliOptions, 'eventlog-endpoint');
const CHANNEL = getRequiredString(cliOptions, 'channel');
const EMIT_INTERVAL_MS = getRequiredPositiveInteger(cliOptions, 'interval-ms');
const ORDERS_PER_INTERVAL = getRequiredPositiveInteger(cliOptions, 'orders-per-interval');
const MAX_ORDERS = getRequiredPositiveIntegerOrNull(cliOptions, 'max-orders');
const eventlogUrl = new URL(EVENTLOG_ENDPOINT);
const httpClient = eventlogUrl.protocol === 'https:' ? https : http;
const requestEventlogJson = createJsonRequester(httpClient);

const firstNames = ['María', 'Luis', 'Ana', 'Javier', 'Lucía', 'Carlos', 'Laura', 'Pablo'];
const lastNames = ['García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez'];
const streets = ['Gran Vía', 'Calle Alcalá', 'Avenida Diagonal', 'Paseo de la Castellana', 'Calle Serrano'];
const cities = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Bilbao'];
const tariffs = ['Tarifa Plana 24h', 'Tarifa Horaria', 'Tarifa Nocturna'];
const supplyTypes = ['Electricidad', 'Gas'];

const verboseLog = createVerboseLogger('ecommerce');

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomPhone() {
  return `+34${Math.floor(600000000 + Math.random() * 399999999)}`;
}

function randomTaxId() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return `${letters[Math.floor(Math.random() * letters.length)]}${Math.floor(1000000 + Math.random() * 8999999)}${letters[Math.floor(Math.random() * letters.length)]}`;
}

function randomIban() {
  return `ES${Math.floor(10 + Math.random() * 89)}${Math.floor(1000 + Math.random() * 8999)}${Math.floor(1000 + Math.random() * 8999)}${Math.floor(1000 + Math.random() * 8999)}${Math.floor(1000 + Math.random() * 8999)}`;
}

function buildOrderBundle() {
  const clientId = randomUUID();
  const billingAccountId = randomUUID();
  const supplyPointId = randomUUID();
  const contractId = randomUUID();
  const orderId = randomUUID();

  const firstName = randomItem(firstNames);
  const lastName = randomItem(lastNames);
  const street = randomItem(streets);
  const city = randomItem(cities);

  const client = {
    id: clientId,
    fullName: `${firstName} ${lastName}`,
    documentId: randomTaxId(),
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@ejemplo.com`,
    phone: randomPhone(),
    address: {
      street: `${street} ${Math.floor(1 + Math.random() * 200)}`,
      city,
      postalCode: `${Math.floor(28000 + Math.random() * 7000)}`,
      country: 'España'
    },
    createdAt: new Date().toISOString()
  };

  const billingAccount = {
    id: billingAccountId,
    clientId,
    iban: randomIban(),
    billingAddress: client.address,
    paymentMethod: 'Domiciliación bancaria',
    status: 'ACTIVA',
    createdAt: new Date().toISOString()
  };

  const supplyPoint = {
    id: supplyPointId,
    clientId,
    cups: `ES00${Math.floor(100000000000000000 + Math.random() * 899999999999999999)}`,
    address: client.address,
    supplyType: randomItem(supplyTypes),
    distributor: 'Distribuidora Nacional',
    contractedPowerKw: Number((3.3 + Math.random() * 6).toFixed(2)),
    createdAt: new Date().toISOString()
  };

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setFullYear(startDate.getFullYear() + 1);

  const tariffName = randomItem(tariffs);

  const contract = {
    id: contractId,
    clientId,
    billingAccountId,
    supplyPointId,
    productId: slugify(tariffName),
    tariff: tariffName,
    status: 'VIGENTE',
    pricePerKWh: Number((0.12 + Math.random() * 0.08).toFixed(4)),
    fixedFeeEurMonth: Number((5 + Math.random() * 10).toFixed(2)),
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    renewalType: 'Renovación automática anual'
  };

  return {
    orderId,
    channel: 'web',
    createdAt: new Date().toISOString(),
    client,
    billingAccount,
    supplyPoint,
    contract
  };
}

let totalOrdersSent = 0;
let intervalHandle = null;

async function emitOrders(count) {
  const remainingCapacity =
    MAX_ORDERS === null ? count : Math.max(0, MAX_ORDERS - totalOrdersSent);

  if (remainingCapacity <= 0) {
    verboseLog('Capacidad máxima de pedidos alcanzada.');
    stopEmitter();
    return;
  }

  const toEmit = Math.min(count, remainingCapacity);
  verboseLog(`Generando ${toEmit} pedido(s) para canal ${CHANNEL}...`);
  for (let i = 0; i < toEmit; i += 1) {
    const bundle = buildOrderBundle();
    try {
      await requestEventlogJson(eventlogUrl, {
        method: 'POST',
        body: { channel: CHANNEL, payload: JSON.stringify(bundle) }
      });
      totalOrdersSent += 1;
      verboseLog(`Pedido ${bundle.orderId} publicado (${totalOrdersSent} total).`);
    } catch (error) {
      console.error('No se pudo publicar el pedido en Event Log:', error.message);
      return;
    }
  }

  if (MAX_ORDERS !== null && totalOrdersSent >= MAX_ORDERS) {
    console.log('Se alcanzó el máximo de pedidos configurado. Deteniendo emisor.');
    stopEmitter();
  }
}

function startEmitter() {
  console.log(
    `Emisor e-commerce activo. Publicando ${ORDERS_PER_INTERVAL} pedido(s) cada ${Math.round(
      EMIT_INTERVAL_MS / 1000
    )} segundos en el canal ${CHANNEL}.`
  );
  emitOrders(ORDERS_PER_INTERVAL);
  if (MAX_ORDERS !== null && totalOrdersSent >= MAX_ORDERS) {
    return;
  }
  intervalHandle = setInterval(() => {
    emitOrders(ORDERS_PER_INTERVAL);
  }, EMIT_INTERVAL_MS);
}

function stopEmitter() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

function setupSignalHandlers() {
  const signals = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, () => {
      console.log(`Recibida señal ${signal}, cerrando emisor e-commerce...`);
      stopEmitter();
      process.exit(0);
    });
  });
}

setupSignalHandlers();
startEmitter();
