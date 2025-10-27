#!/usr/bin/env node

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const readline = require('readline');

const rootDir = __dirname;

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const defaultVerbose = process.env.TE_VERBOSE === 'true' ? 'true' : 'false';

const services = [
  {
    name: 'CRM',
    cwd: path.join(rootDir, 'CRM'),
    command: 'node',
    args: ['app.js'],
    readyRegex: /CRM escuchando en http:\/\/localhost:(\d+)/,
    ports: [{ port: 3000, host: '127.0.0.1' }]
  },
  {
    name: 'FTP',
    cwd: path.join(rootDir, 'FTP'),
    command: 'node',
    args: ['app.js', '--crm-host', 'localhost', '--crm-port', '3000', '--ftp-port', '2121'],
    readyRegex: /Servidor FTP escuchando en ftp:\/\/0\.0\.0\.0:(\d+)/,
    ports: [{ port: 2121, host: '127.0.0.1' }]
  },
  {
    name: 'CRM Ingest',
    cwd: path.join(rootDir, 'datalake', 'ingest'),
    command: 'node',
    args: ['crm_ingest.js', 'http://localhost:3000'],
    readyRegex: /Starting CRM ingestion cycle/,
    env: {
      CRM_POLL_INTERVAL_MS: String(60_000)
    }
  },
  {
    name: 'FTP Ingest',
    cwd: path.join(rootDir, 'datalake', 'ingest'),
    command: 'node',
    args: ['ftp_ingest.js', 'localhost', '2121'],
    readyRegex: /Starting FTP ingestion cycle/,
    env: {
      FTP_POLL_INTERVAL_MS: String(60_000)
    }
  },
  {
    name: 'Transformación P5D → Parquet',
    cwd: path.join(rootDir, 'datalake', 'transform'),
    command: 'node',
    args: ['p5d_to_parquet.js', '--interval-ms', '60000'],
    readyRegex: /Iniciando transformación P5D → Parquet/,
    env: {}
  },
  {
    name: 'Event Log',
    cwd: path.join(rootDir, 'eventlog'),
    command: 'node',
    args: ['app.js'],
    readyRegex: /Event Log service listening on http:\/\/localhost:(\d+)/,
    ports: [{ port: 3050, host: '127.0.0.1' }]
  },
  {
    name: 'Control Center Backend',
    cwd: path.join(rootDir, 'controlcenter', 'backend'),
    command: 'node',
    args: ['src/server.js'],
    readyRegex: /Control Center backend running on port 4000/,
    ports: [{ port: 4000, host: '127.0.0.1' }]
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
  for (const service of services) {
    await startService(service);
  }
  log('Todos los servicios están en ejecución. Presiona Ctrl+C para detenerlos.');
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
        child.once('exit', () => resolve());
        if (process.platform === 'win32') {
          child.kill('SIGTERM');
        } else {
          child.kill('SIGINT');
        }
        setTimeout(() => {
          if (!child.killed) {
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
