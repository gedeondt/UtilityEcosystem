# Control Center

El directorio `controlcenter` contiene una primera versión del panel de control con una aplicación React (frontend) y un servicio Node.js (backend) que exponen métricas del datalake existente en este repositorio.

## Backend

- Ubicación: `controlcenter/backend`
- Entorno: Node.js 18+
- Scripts disponibles:
  - `npm run dev`: inicia el servidor con recarga en caliente (requiere `nodemon`).
  - `npm start`: inicia el servidor en modo producción.
- Variables de entorno:
  - `PORT`: puerto HTTP (por defecto `4000`).
  - `DATALAKE_ROOT`: ruta alternativa al directorio del datalake (por defecto `../../datalake`).

Endpoints relevantes:

- `GET /api/datalake/stats`: devuelve el número de ficheros que contiene cada carpeta del datalake.
- `GET /api/datalake/gold/hourly-average-consumption`: expone el dataset *gold* de consumo medio horario.
- `GET /api/datalake/gold/customers-by-product`: devuelve el mart *gold* con clientes y contratos agregados por producto del CRM.

## Frontend

- Ubicación: `controlcenter/frontend`
- Entorno: Node.js 18+
- Scripts disponibles:
  - `npm run dev`: arranca la aplicación en modo desarrollo.
  - `npm run build`: genera la versión lista para producción.
  - `npm run preview`: sirve la build generada.
- Variables de entorno:
  - `VITE_API_BASE_URL`: URL base del backend (por defecto `http://localhost:4000`).

El panel incluye widgets que consumen estos endpoints para mostrar métricas del ecosistema: la distribución de ficheros del datalake, el mart de clientes por producto y la serie de consumo medio horario.
