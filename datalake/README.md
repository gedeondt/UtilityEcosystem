# Datalake

Este módulo define la estructura básica del datalake y los procesos de ingesta iniciales para los servicios CRM y FTP.

## Estructura de carpetas

- `data/`
  - `bronce/`, `silver/`, `gold/`: capas principales del datalake. Permanecen vacías en el repositorio y se generan dinámicamente en ejecución.
  - `landing/`: zona de aterrizaje utilizada por los procesos de ingesta.
    - `crm/`: almacena los ficheros JSON recibidos del servicio CRM.
    - `ftp/`: almacena los ficheros descargados desde el servidor FTP.
- `ingest/`: scripts Node.js que ejecutan los procesos de ingesta.
- `transform/`: scripts Node.js encargados de elevar los datos desde *landing* hasta la capa *silver*.

## Ejecución de los procesos

Instala las dependencias:

```bash
cd ingest
npm install
```

### Ingesta CRM

```bash
node crm_ingest.js <CRM_SERVICE_URL> [OUTPUT_DIR] [POLL_INTERVAL_MS]
```

Variables de entorno soportadas:

- `CRM_SERVICE_URL` (obligatoria si no se pasa como argumento)
- `CRM_OUTPUT_DIR` (ruta donde se depositarán los JSON)
- `CRM_POLL_INTERVAL_MS` (milisegundos entre ejecuciones, por defecto 180000)

El script consulta al servicio CRM y guarda la respuesta tal y como llega. Si la respuesta es JSON válido, se formatea para facilitar su lectura.

### Ingesta FTP

```bash
node ftp_ingest.js <FTP_HOST> [PORT] [USER] [PASSWORD] [REMOTE_DIR] [SECURE] [OUTPUT_DIR] [POLL_INTERVAL_MS]
```

Variables de entorno soportadas:

- `FTP_HOST` (obligatoria si no se pasa como argumento)
- `FTP_PORT` (por defecto 21)
- `FTP_USER` y `FTP_PASSWORD`
- `FTP_REMOTE_DIR` (directorio remoto, `/` por defecto)
- `FTP_SECURE` (`true`, `false` o `implicit`)
- `FTP_OUTPUT_DIR`
- `FTP_POLL_INTERVAL_MS`

Cada ciclo descarga los ficheros disponibles en el FTP al directorio de aterrizaje, eliminando del servidor únicamente aquellos que se han descargado correctamente.

Ambos scripts se ejecutan de manera continua, repitiendo el ciclo cada tres minutos (configurable) y dejando los procesos en ejecución.
