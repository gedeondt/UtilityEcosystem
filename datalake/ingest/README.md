# Procesos de ingesta del datalake

Este directorio contiene los conectores encargados de poblar la capa *landing* del datalake.
Cada script indica la fuente de datos que consulta, el formato que consume y dónde deja los ficheros resultantes.

## Scripts disponibles

### `crm_ingest.js`

- **Origen:** API REST del servicio CRM (`/customers`).
- **Formato leído:** JSON devuelto por el endpoint del CRM.
- **Destino:** `../data/landing/crm/<timestamp>/<entidad>.json` (una carpeta por instantánea que agrupa todas las entidades consultadas en el mismo ciclo).
- **Comportamiento:** ejecuta peticiones periódicas (intervalo configurable mediante `CRM_POLL_INTERVAL_MS`) y almacena la respuesta formateada en la zona de *landing* sin transformaciones adicionales.

### `ftp_ingest.js`

- **Origen:** servidor FTP corporativo (parámetros de conexión configurables por argumentos o variables de entorno).
- **Formato leído:** ficheros P5D en texto plano (`P5D*.txt`).
- **Destino:** `../data/landing/ftp/<fecha>/P5D*.txt` (estructura de carpetas que replica el árbol remoto descargado).
- **Comportamiento:** se conecta de forma periódica, descarga los ficheros nuevos y los elimina del FTP únicamente cuando la descarga finaliza correctamente.
