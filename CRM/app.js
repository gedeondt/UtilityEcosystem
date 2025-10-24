const http = require('http');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const SEED_INTERVAL_MS = 10_000;
const SEED_RATE = (() => {
  const arg = Number(process.argv[2]);
  return Number.isFinite(arg) && arg > 0 ? Math.floor(arg) : 1;
})();

const MAX_CLIENTS = (() => {
  const arg = Number(process.argv[3]);
  return Number.isFinite(arg) && arg > 0 ? Math.floor(arg) : null;
})();

const clients = [];
const billingAccounts = [];
const supplyPoints = [];
const contracts = [];

const firstNames = ['María', 'Luis', 'Ana', 'Javier', 'Lucía', 'Carlos', 'Laura', 'Pablo'];
const lastNames = ['García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez'];
const streets = ['Gran Vía', 'Calle Alcalá', 'Avenida Diagonal', 'Paseo de la Castellana', 'Calle Serrano'];
const cities = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Bilbao'];
const tariffs = ['Tarifa Plana 24h', 'Tarifa Horaria', 'Tarifa Nocturna'];
const supplyTypes = ['Electricidad', 'Gas'];

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

function createClientBundle() {
  const clientId = randomUUID();
  const billingAccountId = randomUUID();
  const supplyPointId = randomUUID();
  const contractId = randomUUID();

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

  const contract = {
    id: contractId,
    clientId,
    billingAccountId,
    supplyPointId,
    tariff: randomItem(tariffs),
    status: 'VIGENTE',
    pricePerKWh: Number((0.12 + Math.random() * 0.08).toFixed(4)),
    fixedFeeEurMonth: Number((5 + Math.random() * 10).toFixed(2)),
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    renewalType: 'Renovación automática anual'
  };

  return { client, billingAccount, supplyPoint, contract };
}

function seed(count) {
  const remainingCapacity =
    MAX_CLIENTS === null ? count : Math.max(0, MAX_CLIENTS - clients.length);

  if (remainingCapacity <= 0) {
    console.log('Límite máximo de clientes alcanzado.');
    return [];
  }

  const toCreate = Math.min(count, remainingCapacity);

  const created = [];
  for (let i = 0; i < toCreate; i += 1) {
    const bundle = createClientBundle();
    clients.push(bundle.client);
    billingAccounts.push(bundle.billingAccount);
    supplyPoints.push(bundle.supplyPoint);
    contracts.push(bundle.contract);
    created.push(bundle.client.id);
  }
  console.log(`Añadidos ${toCreate} clientes. Total clientes: ${clients.length}`);
  return created;
}

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
  console.log(`Sembrando ${SEED_RATE} cliente(s) cada ${SEED_INTERVAL_MS / 1000} segundos...`);
  if (MAX_CLIENTS !== null) {
    console.log(`Límite máximo de clientes configurado en ${MAX_CLIENTS}.`);
  }

  seed(SEED_RATE);

  if (MAX_CLIENTS !== null && clients.length >= MAX_CLIENTS) {
    console.log('Generación automática deshabilitada: límite máximo alcanzado tras la inicialización.');
    return;
  }

  const interval = setInterval(() => {
    seed(SEED_RATE);
    if (MAX_CLIENTS !== null && clients.length >= MAX_CLIENTS) {
      clearInterval(interval);
      console.log('Deteniendo generación automática: límite máximo alcanzado.');
    }
  }, SEED_INTERVAL_MS);
});
