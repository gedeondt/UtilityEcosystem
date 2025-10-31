#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs/promises');
const net = require('net');
const path = require('path');
const readline = require('readline');

const rootDir = __dirname;

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const defaultVerbose = process.env.TE_VERBOSE === 'true' ? 'true' : 'false';

const defaults = {
  eventlog: {
    host: '0.0.0.0',
    port: 3050,
    logRoot: path.join(rootDir, 'eventlog', 'log')
  },
  crm: {
    port: 3000,
    ecommercePollIntervalMs: 5_000,
    ecommerceMaxEventsPerPoll: null,
    maxClients: null,
    eventlogEndpoint: 'http://localhost:3050/events',
    ecommerceChannel: 'ecommerce',
    clientappChannel: 'clientapp',
    ecommerceFrom: null,
    clientappFrom: null,
    clientappPollIntervalMs: 30_000,
    clientappMaxEventsPerPoll: null
  },
  ecommerce: {
    eventlogEndpoint: 'http://localhost:3050/events',
    channel: 'ecommerce',
    intervalMs: 10_000,
    ordersPerInterval: 1,
    maxOrders: null
  },
  clientapp: {
    eventlogEndpoint: 'http://localhost:3050/events',
    crmEndpoint: 'http://localhost:3000/contracts',
    channel: 'clientapp',
    intervalMs: 30_000,
    maxUpdates: 5,
    pageSize: 100
  },
  ftp: {
    crmHost: 'localhost',
    crmPort: 3000,
    ftpPort: 2121,
    pollInterval: 60_000,
    pageSize: 50,
    ftpRoot: path.join(rootDir, 'FTP', 'ftp-data')
  },
  crmIngest: {
    serviceUrl: 'http://localhost:3000',
    outputDir: path.join(rootDir, 'datalake', 'data', 'landing', 'crm'),
    intervalMs: 60_000
  },
  ftpIngest: {
    host: 'localhost',
    port: 2121,
    remoteDir: '/',
    outputDir: path.join(rootDir, 'datalake', 'data', 'landing', 'ftp'),
    intervalMs: 60_000
  },
  p5dTransform: {
    inputDir: path.join(rootDir, 'datalake', 'data', 'landing', 'ftp'),
    outputFile: path.join(rootDir, 'datalake', 'data', 'silver', 'p5d', 'p5d_readings.parquet'),
    intervalMs: 60_000
  },
  hourlyTransform: {
    inputFile: path.join(rootDir, 'datalake', 'data', 'silver', 'p5d', 'p5d_readings.parquet'),
    outputFile: path.join(
      rootDir,
      'datalake',
      'data',
      'gold',
      'controlcenter',
      'hourly_average_consumption.json'
    ),
    intervalMs: 60_000
  },
  controlCenterBackend: {
    port: 4000
  }
};

const toCliValue = (value) => (value === null ? 'null' : String(value));

const services = [
  {
    name: 'Event Log',
    cwd: path.join(rootDir, 'eventlog'),
    command: 'node',
    args: [
      'app.js',
      '--host',
      defaults.eventlog.host,
      '--port',
      String(defaults.eventlog.port),
      '--log-root',
      defaults.eventlog.logRoot
    ],
    readyRegex: /Event Log service listening on http:\/\/localhost:(\d+)/,
    ports: [{ port: defaults.eventlog.port, host: '127.0.0.1' }]
  },
  {
    name: 'CRM',
    cwd: path.join(rootDir, 'CRM'),
    command: 'node',
    args: [
      'app.js',
      '--port',
      String(defaults.crm.port),
      '--ecommerce-poll-interval-ms',
      String(defaults.crm.ecommercePollIntervalMs),
      '--ecommerce-max-events-per-poll',
      toCliValue(defaults.crm.ecommerceMaxEventsPerPoll),
      '--max-clients',
      toCliValue(defaults.crm.maxClients),
      '--eventlog-endpoint',
      defaults.crm.eventlogEndpoint,
      '--ecommerce-channel',
      defaults.crm.ecommerceChannel,
      '--clientapp-channel',
      defaults.crm.clientappChannel,
      '--ecommerce-from',
      toCliValue(defaults.crm.ecommerceFrom),
      '--clientapp-from',
      toCliValue(defaults.crm.clientappFrom),
      '--clientapp-poll-interval-ms',
      String(defaults.crm.clientappPollIntervalMs),
      '--clientapp-max-events-per-poll',
      toCliValue(defaults.crm.clientappMaxEventsPerPoll)
    ],
    readyRegex: /CRM escuchando en http:\/\/localhost:(\d+)/,
    ports: [{ port: defaults.crm.port, host: '127.0.0.1' }]
  },
  {
    name: 'E-commerce',
    cwd: path.join(rootDir, 'ecommerce'),
    command: 'node',
    args: [
      'app.js',
      '--eventlog-endpoint',
      defaults.ecommerce.eventlogEndpoint,
      '--channel',
      defaults.ecommerce.channel,
      '--interval-ms',
      String(defaults.ecommerce.intervalMs),
      '--orders-per-interval',
      String(defaults.ecommerce.ordersPerInterval),
      '--max-orders',
      toCliValue(defaults.ecommerce.maxOrders)
    ],
    readyRegex: /Emisor e-commerce activo\./
  },
  {
    name: 'Client App',
    cwd: path.join(rootDir, 'clientapp'),
    command: 'node',
    args: [
      'app.js',
      '--eventlog-endpoint',
      defaults.clientapp.eventlogEndpoint,
      '--crm-endpoint',
      defaults.clientapp.crmEndpoint,
      '--channel',
      defaults.clientapp.channel,
      '--interval-ms',
      String(defaults.clientapp.intervalMs),
      '--max-updates',
      String(defaults.clientapp.maxUpdates),
      '--page-size',
      String(defaults.clientapp.pageSize)
    ],
    readyRegex: /Client App simulator activo/
  },
  {
    name: 'FTP',
    cwd: path.join(rootDir, 'FTP'),
    command: 'node',
    args: [
      'app.js',
      '--crm-host',
      defaults.ftp.crmHost,
      '--crm-port',
      String(defaults.ftp.crmPort),
      '--ftp-port',
      String(defaults.ftp.ftpPort),
      '--poll-interval',
      String(defaults.ftp.pollInterval),
      '--page-size',
      String(defaults.ftp.pageSize),
      '--ftp-root',
      defaults.ftp.ftpRoot
    ],
    readyRegex: /Servidor FTP escuchando en ftp:\/\/0\.0\.0\.0:(\d+)/,
    ports: [{ port: defaults.ftp.ftpPort, host: '127.0.0.1' }]
  },
  {
    name: 'CRM Ingest',
    cwd: path.join(rootDir, 'datalake', 'ingest'),
    command: 'node',
    args: [
      'crm_ingest.js',
      '--service-url',
      defaults.crmIngest.serviceUrl,
      '--output-dir',
      defaults.crmIngest.outputDir,
      '--interval-ms',
      String(defaults.crmIngest.intervalMs)
    ],
    readyRegex: /Starting CRM ingestion cycle/
  },
  {
    name: 'FTP Ingest',
    cwd: path.join(rootDir, 'datalake', 'ingest'),
    command: 'node',
    args: [
      'ftp_ingest.js',
      '--host',
      defaults.ftpIngest.host,
      '--port',
      String(defaults.ftpIngest.port),
      '--remote-dir',
      defaults.ftpIngest.remoteDir,
      '--output-dir',
      defaults.ftpIngest.outputDir,
      '--interval-ms',
      String(defaults.ftpIngest.intervalMs)
    ],
    readyRegex: /Starting FTP ingestion cycle/
  },
  {
    name: 'Transformación P5D → Parquet',
    cwd: path.join(rootDir, 'datalake', 'transform'),
    command: 'node',
    args: [
      'p5d_to_parquet.js',
      '--input',
      defaults.p5dTransform.inputDir,
      '--output',
      defaults.p5dTransform.outputFile,
      '--interval-ms',
      String(defaults.p5dTransform.intervalMs)
    ],
    readyRegex: /Iniciando transformación P5D → Parquet/,
    env: {}
  },
  {
    name: 'Transformación consumo medio horario',
    cwd: path.join(rootDir, 'datalake', 'transform'),
    command: 'node',
    args: [
      'p5d_hourly_consumption_to_json.js',
      '--input',
      defaults.hourlyTransform.inputFile,
      '--output',
      defaults.hourlyTransform.outputFile,
      '--interval-ms',
      String(defaults.hourlyTransform.intervalMs)
    ],
    readyRegex: /Iniciando generación de consumo medio horario en Gold/,
    env: {}
  },
  {
    name: 'Control Center Backend',
    cwd: path.join(rootDir, 'controlcenter', 'backend'),
    command: 'node',
    args: ['src/server.js'],
    readyRegex: /Control Center backend running on port 4000/,
    ports: [{ port: defaults.controlCenterBackend.port, host: '127.0.0.1' }],
    env: {
      PORT: String(defaults.controlCenterBackend.port)
    }
  },
  {
    name: 'Control Center Frontend',
    cwd: path.join(rootDir, 'controlcenter', 'frontend'),
    command: npmCmd,
    args: ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173', '--strictPort'],
    readyRegex: /Local:\s+http:\/\/localhost:5173\//,
    ports: [{ port: 5173, host: '127.0.0.1' }],
    env: {
      VITE_API_BASE_URL: 'http://localhost:4000'
    }
  }
];

const runningProcesses = new Set();
let shuttingDown = false;

const cleanupTargets = [
  path.join(rootDir, 'eventlog', 'log'),
  path.join(rootDir, 'datalake', 'data', 'landing', 'crm'),
  path.join(rootDir, 'datalake', 'data', 'landing', 'ftp'),
  path.join(rootDir, 'datalake', 'data', 'silver', 'p5d'),
  path.join(rootDir, 'datalake', 'data', 'gold'),
  path.join(rootDir, 'datalake', 'transform', '.p5d_transform_state.json')
];

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

async function ensurePortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        resolve(false);
        return;
      }
      reject(error);
    });
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, host);
  });
}

function pipeOutput(stream, name, onLine) {
  const rl = readline.createInterface({ input: stream });
  rl.on('line', (line) => {
    if (line.trim().length === 0) {
      return;
    }
    log(`[${name}] ${line}`);
    if (onLine) {
      onLine(line);
    }
  });
  rl.on('close', () => {
    if (!shuttingDown) {
      log(`[${name}] flujo cerrado`);
    }
  });
}

async function startService(service) {
  const { name, cwd, command, args, readyRegex, ports = [], env = {} } = service;
  log(`Preparando servicio ${name}...`);

  for (const { port, host } of ports) {
    const available = await ensurePortAvailable(port, host);
    if (!available) {
      throw new Error(`El puerto ${port} (${host}) está en uso. Libéralo antes de iniciar ${name}.`);
    }
  }

  return new Promise((resolve, reject) => {
    log(`Iniciando ${name} (${command} ${args.join(' ')})...`);
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, TE_VERBOSE: defaultVerbose, ...env },
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });

    runningProcesses.add(child);

    let resolved = false;
    const handleReady = (line) => {
      if (!resolved && readyRegex && readyRegex.test(line)) {
        resolved = true;
        log(`Servicio ${name} listo.`);
        resolve();
      }
    };

    pipeOutput(child.stdout, name, handleReady);
    pipeOutput(child.stderr, `${name} (err)`, handleReady);

    child.on('error', (error) => {
      if (!resolved) {
        reject(new Error(`No se pudo iniciar ${name}: ${error.message}`));
      }
    });

    child.on('exit', (code, signal) => {
      runningProcesses.delete(child);
      if (shuttingDown) {
        return;
      }
      if (code === 0) {
        log(`El servicio ${name} finalizó con código 0.`);
        if (!resolved) {
          reject(new Error(`El servicio ${name} terminó antes de señalizar que estaba listo.`));
        }
      } else {
        const reason = signal ? `por señal ${signal}` : `con código ${code}`;
        const error = new Error(`El servicio ${name} finalizó ${reason}.`);
        if (!resolved) {
          reject(error);
        } else {
          log(error.message);
        }
      }
    });

    if (!readyRegex) {
      resolved = true;
      resolve();
    }
  });
}

async function launch() {
  await cleanWorkingDirectories();
  for (const service of services) {
    await startService(service);
  }
  log('Todos los servicios están en ejecución. Presiona Ctrl+C para detenerlos.');
}

async function cleanWorkingDirectories() {
  log('Limpiando artefactos previos...');
  for (const target of cleanupTargets) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      log(`Limpieza completada para ${target}`);
    } catch (error) {
      log(`No se pudo limpiar ${target}: ${error.message}`);
    }
  }
}

async function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log('Recibiendo señal de apagado. Deteniendo servicios...');
  const killPromises = [];
  for (const child of runningProcesses) {
    killPromises.push(
      new Promise((resolve) => {
        const preferredSignal = process.platform === 'win32' ? 'SIGTERM' : 'SIGINT';
        const onExit = () => {
          clearTimeout(forceKillTimer);
          resolve();
        };

        child.once('exit', onExit);
        child.kill(preferredSignal);

        const forceKillTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            log('El subproceso no respondió a la señal de apagado. Forzando cierre...');
            child.kill('SIGKILL');
          }
        }, 5000);
      })
    );
  }
  await Promise.allSettled(killPromises);
  log('Todos los servicios se han detenido.');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (error) => {
  log(`Error no capturado: ${error.stack || error.message}`);
  shutdown().finally(() => process.exit(1));
});
process.on('unhandledRejection', (reason) => {
  log(`Promesa rechazada sin manejar: ${reason}`);
  shutdown().finally(() => process.exit(1));
});

launch().catch((error) => {
  log(`Error al iniciar los servicios: ${error.message}`);
  shutdown().finally(() => process.exit(1));
});
