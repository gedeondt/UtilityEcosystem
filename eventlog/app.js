const http = require('http');
const { randomUUID } = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const PORT = process.env.EVENTLOG_PORT ? Number(process.env.EVENTLOG_PORT) : 3050;
const HOST = process.env.EVENTLOG_HOST || '0.0.0.0';
const BASE_URL = `http://localhost:${PORT}`;
const LOG_ROOT = path.join(__dirname, 'log');
const isVerbose = process.env.TE_VERBOSE === 'true';

const verboseLog = (...args) => {
  if (isVerbose) {
    console.log('[eventlog]', ...args);
  }
};

async function ensureBaseDir() {
  await fsp.mkdir(LOG_ROOT, { recursive: true });
}

async function purgeLogDirectory() {
  try {
    await fsp.rm(LOG_ROOT, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('No se pudo limpiar el directorio de logs:', error.message);
    }
  }
}

function registerExitCleanup() {
  process.once('exit', () => {
    try {
      fs.rmSync(LOG_ROOT, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('No se pudo limpiar el directorio de logs al salir:', error.message);
      }
    }
  });
}

function sanitizeChannel(channel) {
  if (typeof channel !== 'string' || channel.trim().length === 0) {
    throw new Error('Canal requerido');
  }

  const trimmed = channel.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new Error('El nombre del canal solo puede contener letras, números, guiones y guiones bajos');
  }

  return trimmed;
}

function sanitizePayload(payload) {
  if (typeof payload !== 'string' || payload.length === 0) {
    throw new Error('El payload debe ser texto');
  }
  return payload;
}

async function handlePublish(req, res) {
  try {
    const body = await readJsonBody(req);
    const channel = sanitizeChannel(body.channel);
    const payload = sanitizePayload(body.payload);

    const createdAt = new Date().toISOString();
    const id = randomUUID();
    const record = { id, channel, createdAt, payload };

    const channelDir = path.join(LOG_ROOT, channel);
    await fsp.mkdir(channelDir, { recursive: true });

    const fileSafeDate = createdAt.replace(/[:.]/g, '-');
    const fileName = `${fileSafeDate}-${id}.json`;
    const filePath = path.join(channelDir, fileName);
    await fsp.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');

    verboseLog(`Mensaje registrado en canal ${channel} con id ${id}`);
    sendJson(res, 200, { id, channel, createdAt });
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(res, 400, { error: 'JSON inválido' });
      return;
    }

    sendJson(res, 400, { error: error.message || 'Error procesando la solicitud' });
  }
}

async function handleRetrieve(req, res, url) {
  try {
    const channel = sanitizeChannel(url.searchParams.get('canal') || url.searchParams.get('channel'));
    const fromParam = url.searchParams.get('frontera') || url.searchParams.get('from');
    const fromDate = fromParam ? new Date(fromParam) : null;

    if (fromParam && Number.isNaN(fromDate.getTime())) {
      throw new Error('Fecha de frontera inválida');
    }

    const channelDir = path.join(LOG_ROOT, channel);
    let files;
    try {
      files = await fsp.readdir(channelDir);
    } catch (error) {
      if (error.code === 'ENOENT') {
        sendJson(res, 200, []);
        return;
      }
      throw error;
    }

    const messages = [];
    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }
      const filePath = path.join(channelDir, file);
      try {
        const data = await fsp.readFile(filePath, 'utf8');
        const record = JSON.parse(data);
        if (!record.createdAt || !record.id || typeof record.payload !== 'string') {
          continue;
        }
        if (fromDate && new Date(record.createdAt) < fromDate) {
          continue;
        }
        messages.push({ id: record.id, createdAt: record.createdAt, payload: record.payload });
      } catch (error) {
        console.error(`No se pudo leer el archivo ${filePath}:`, error.message);
      }
    }

    messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    sendJson(res, 200, messages);
  } catch (error) {
    sendJson(res, 400, { error: error.message || 'Error procesando la solicitud' });
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('El cuerpo es demasiado grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const json = JSON.parse(data || '{}');
        resolve(json);
      } catch (error) {
        reject(new SyntaxError('JSON inválido'));
      }
    });
    req.on('error', (error) => reject(error));
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, { error: 'No encontrado' });
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: 'Método no permitido' });
}

function requestHandler(req, res) {
  const url = new URL(req.url, BASE_URL);

  if (url.pathname === '/eventos' || url.pathname === '/events') {
    if (req.method === 'POST') {
      handlePublish(req, res);
      return;
    }
    if (req.method === 'GET') {
      handleRetrieve(req, res, url);
      return;
    }
    methodNotAllowed(res);
    return;
  }

  notFound(res);
}

async function start() {
  await purgeLogDirectory();
  await ensureBaseDir();
  registerExitCleanup();
  const server = http.createServer(requestHandler);

  server.listen(PORT, HOST, () => {
    console.log(`Event Log service listening on http://localhost:${PORT}`);
  });

  const signals = ['SIGINT', 'SIGTERM'];
  let shuttingDown = false;
  for (const signal of signals) {
    process.on(signal, () => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      console.log(`Recibida señal ${signal}, cerrando Event Log...`);
      server.close(() => {
        purgeLogDirectory()
          .catch((error) => {
            console.error('No se pudo limpiar el directorio de logs:', error);
          })
          .finally(() => {
            process.exit(0);
          });
      });
    });
  }
}

start().catch((error) => {
  console.error('No se pudo iniciar Event Log:', error);
  process.exit(1);
});
