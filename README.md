# UtilityEcosystem

## Lanzador de servicios

Este repositorio incluye un lanzador que levanta toda la plataforma con un único comando. El script inicia los servicios en el orden adecuado y verifica que los puertos necesarios estén libres antes de arrancar cada componente.

### Requisitos previos

Instala las dependencias de cada módulo (una sola vez) ejecutando desde la raíz del repositorio:

```bash
npm install --prefix CRM
npm install --prefix ecommerce
npm install --prefix clientapp
npm install --prefix FTP
npm install --prefix datalake/ingest
npm install --prefix datalake/transform
npm install --prefix controlcenter/backend
npm install --prefix controlcenter/frontend
```

### Puertos utilizados

* Event Log: `http://localhost:3050`
* CRM: `http://localhost:3000`
* FTP: `ftp://localhost:2121`
* Control Center Backend: `http://localhost:4000`
* Control Center Frontend: `http://localhost:5173`

Asegúrate de que estos puertos estén libres antes de ejecutar el lanzador.

### Ejecución

Desde la raíz del repositorio ejecuta:

```bash
node launcher.js
```

El lanzador iniciará los servicios en el siguiente orden:

1. Event Log
2. CRM
3. Emisor e-commerce
4. Client App Simulator
5. Servidor FTP
6. Ingesta del CRM
7. Ingesta del FTP
8. Transformación P5D → Parquet
9. Control Center Backend
10. Control Center Frontend

Cuando todos los servicios estén arriba se mostrará un mensaje de confirmación. Usa `Ctrl+C` para detener toda la plataforma; el lanzador enviará las señales necesarias para apagar cada servicio de forma ordenada.
