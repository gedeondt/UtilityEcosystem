# Transformaciones del datalake

Este directorio alberga los procesos que refinan los datos almacenados en las distintas capas del datalake.
Cada script indica claramente el origen de los datos, el formato de lectura y el destino al que persiste los resultados.

## Scripts disponibles

### `p5d_to_parquet.js`

- **Origen:** `../data/landing/ftp/**/*.txt` (ficheros P5D descargados del servidor FTP).
- **Destino:** `../data/silver/p5d/p5d_readings.parquet` (dataset Parquet con un registro por hora, contrato y punto de suministro).
- **Propósito:** normaliza los ficheros P5D y los convierte en un dataset *silver* incremental listo para ser consultado.
- **Invocación:** `node p5d_to_parquet.js [--input <dir>] [--output <file>] [--interval-ms <ms>]`.

### `p5d_hourly_consumption_to_json.js`

- **Origen:** `../data/silver/p5d/p5d_readings.parquet` (consumos horarios por contrato generados por `p5d_to_parquet.js`).
- **Destino:** `../data/gold/controlcenter/hourly_average_consumption.json` (estadística agregada en formato JSON para el panel de control).
- **Propósito:** calcula el consumo medio horario, el número de medidas consideradas y el recuento de contratos/días involucrados y publica el resultado en la capa *gold*.
- **Invocación:** `node p5d_hourly_consumption_to_json.js [--input <file>] [--output <file>] [--interval-ms <ms>] [--once]`.

### `crm_entities_to_bronze.js`

- **Origen:** `../data/landing/crm/<timestamp>/*.json` (instantáneas generadas por `crm_ingest.js`).
- **Destino:** `../data/bronce/crm/<entidad>_latest.json` (representación consolidada del estado actual de cada entidad del CRM).
- **Propósito:** mantener sincronizado el estado del CRM en la capa *bronze* tomando siempre la última instantánea disponible.
- **Invocación:** `node crm_entities_to_bronze.js [LANDING_DIR] [OUTPUT_DIR] [INTERVAL_MS]`.
