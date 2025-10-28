const fs = require('fs');
const path = require('path');
const { mkdir, rm, writeFile } = require('fs/promises');
const { setInterval } = require('timers');
const FtpSrv = require('ftp-srv');

const DEFAULT_FTP_PORT = 2121;
const DEFAULT_POLL_INTERVAL = 60_000;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_FTP_ROOT = path.join(__dirname, 'ftp-data');

const isVerbose = process.env.TE_VERBOSE === 'true';
const verboseLog = (...args) => {
  if (isVerbose) {
    console.log(...args);
  }
};

function parseArgs(argv) {
  const options = {
    crmHost: 'localhost',
    crmPort: 3000,
    ftpPort: DEFAULT_FTP_PORT,
    pollInterval: DEFAULT_POLL_INTERVAL
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }

    const key = arg.slice(2);
    const value = argv[i + 1];

    switch (key) {
      case 'crm-host':
        if (value) {
          options.crmHost = value;
          i += 1;
        }
        break;
      case 'crm-port': {
        const port = Number(value);
        if (Number.isInteger(port) && port > 0) {
          options.crmPort = port;
          i += 1;
        } else {
          throw new Error('El puerto del CRM debe ser un número entero positivo');
        }
        break;
      }
      case 'ftp-port': {
        const port = Number(value);
        if (Number.isInteger(port) && port > 0) {
          options.ftpPort = port;
          i += 1;
        } else {
          throw new Error('El puerto del FTP debe ser un número entero positivo');
        }
        break;
      }
      case 'poll-interval': {
        const interval = Number(value);
        if (Number.isInteger(interval) && interval > 0) {
          options.pollInterval = interval;
          i += 1;
        } else {
          throw new Error('El intervalo de consulta debe ser un número entero positivo');
        }
        break;
      }
      default:
        throw new Error(`Argumento no reconocido: --${key}`);
    }
  }

  return options;
}

async function fetchContracts({ host, port, pageSize }) {
  const contracts = [];
  let currentPage = 1;

  while (true) {
    const url = `http://${host}:${port}/contracts?page=${currentPage}&perPage=${pageSize}`;
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Error(`No se pudo conectar al CRM (${error.message})`);
    }

    if (!response.ok) {
      throw new Error(`Respuesta inesperada del CRM: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const { data, pagination } = payload;

    data.filter((contract) => contract.status === 'VIGENTE').forEach((contract) => {
      contracts.push(contract);
    });

    if (!pagination || currentPage >= pagination.totalPages) {
      break;
    }

    currentPage += 1;
  }

  return contracts;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}${month}${day}`;
}

function buildP5DFileName(contractId, date) {
  return `P5D_${contractId}_${formatDate(date)}.txt`;
}

function buildP5DContent(contract, date) {
  const dateStr = formatDate(date);
  const lines = [`P5D|${contract.id}|${dateStr}|${contract.supplyPointId}`];

  for (let hour = 0; hour < 24; hour += 1) {
    const consumption = (1 + Math.random() * 5).toFixed(3);
    lines.push(`${hour.toString().padStart(2, '0')};${consumption}`);
  }

  return lines.join('\n');
}

async function resetFtpDirectory(directory) {
  try {
    await rm(directory, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`No se pudo limpiar el directorio FTP ${directory}:`, error.message);
    }
  }

  await mkdir(directory, { recursive: true });
}

function registerExitCleanup(directory) {
  process.once('exit', () => {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`No se pudo limpiar el directorio FTP ${directory} al salir:`, error.message);
      }
    }
  });
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const { crmHost, crmPort, ftpPort, pollInterval } = options;
  const ftpRootDir = DEFAULT_FTP_ROOT;

  try {
    await mkdir(ftpRootDir, { recursive: true });
  } catch (error) {
    console.error('No se pudo preparar el directorio raíz del FTP:', error.message);
    process.exit(1);
  }

  await resetFtpDirectory(ftpRootDir);

  const ftpServer = new FtpSrv({
    url: `ftp://0.0.0.0:${ftpPort}`,
    anonymous: true,
    greeting: ['Servidor FTP de contratos energéticos listo']
  });

  registerExitCleanup(ftpRootDir);

  ftpServer.on('login', ({ connection }, resolve, reject) => {
    connection.on('STOR', () => {
      console.warn('Se recibió una operación STOR desde un cliente FTP externo');
    });

    resolve({ root: ftpRootDir });
  });

  try {
    await ftpServer.listen();
  } catch (error) {
    console.error('No se pudo iniciar el servidor FTP:', error.message);
    process.exit(1);
  }

  console.log(`Servidor FTP escuchando en ftp://0.0.0.0:${ftpPort}`);
  verboseLog(
    `Consultando contratos del CRM en ${crmHost}:${crmPort} cada ${pollInterval / 1000} segundos`
  );

  const baseDate = new Date();
  let iteration = 0;
  let cycleInterval = null;
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    console.log(`Recibida señal ${signal}, cerrando servidor FTP...`);

    if (cycleInterval) {
      clearInterval(cycleInterval);
    }

    try {
      await ftpServer.close();
    } catch (error) {
      if (error && error.message) {
        console.warn('Error al cerrar el servidor FTP:', error.message);
      }
    }

    try {
      await resetFtpDirectory(ftpRootDir);
    } catch (error) {
      console.warn('No se pudo limpiar el directorio FTP durante el apagado:', error.message);
    }

    process.exit(0);
  };

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      shutdown(signal).catch((error) => {
        console.error('Error inesperado durante el apagado del servidor FTP:', error);
        process.exit(1);
      });
    });
  }

  const runCycle = async () => {
    const targetDate = new Date(baseDate);
    targetDate.setDate(baseDate.getDate() + iteration);

    verboseLog(`Generando ficheros P5D para la fecha ${targetDate.toISOString().slice(0, 10)}`);

    let contracts;
    try {
      contracts = await fetchContracts({ host: crmHost, port: crmPort, pageSize: DEFAULT_PAGE_SIZE });
    } catch (error) {
      console.error('Error al obtener contratos:', error.message);
      return;
    }

    if (contracts.length === 0) {
      verboseLog('No se encontraron contratos activos en esta iteración.');
    }

    await Promise.all(
      contracts.map(async (contract) => {
        const fileName = buildP5DFileName(contract.id, targetDate);
        const content = buildP5DContent(contract, targetDate);
        const destination = path.join(ftpRootDir, fileName);
        try {
          await writeFile(destination, content, 'utf8');
          verboseLog(`Generado fichero ${fileName}`);
        } catch (error) {
          console.error(`No se pudo escribir el fichero ${fileName}: ${error.message}`);
        }
      })
    );

    iteration += 1;
  };

  await runCycle();
  cycleInterval = setInterval(() => {
    runCycle().catch((error) => {
      console.error('Error inesperado en el ciclo de generación:', error);
    });
  }, pollInterval);
}

main();
