# Client App Simulator

Este servicio simula la aplicación móvil/web de clientes.

## Funcionalidad

* Cada 30 segundos descarga la lista de contratos del CRM.
* Selecciona un subconjunto aleatorio y genera eventos de cambio de producto.
* Publica los eventos en el canal `clientapp` del Event Log.

## Ejecución

```bash
npm install --prefix clientapp
node clientapp/app.js
```

Variables de entorno relevantes:

* `CLIENTAPP_INTERVAL_MS`: milisegundos entre ciclos (por defecto 30000).
* `CLIENTAPP_MAX_UPDATES`: máximo de contratos a actualizar por ciclo (por defecto 5).
* `CLIENTAPP_EVENTLOG_ENDPOINT`: URL del Event Log (por defecto `http://localhost:3050/events`).
* `CLIENTAPP_CRM_ENDPOINT`: URL base para recuperar contratos del CRM (por defecto `http://localhost:3000/contracts`).
* `CLIENTAPP_CHANNEL`: canal de Event Log usado para publicar eventos (por defecto `clientapp`).
```
