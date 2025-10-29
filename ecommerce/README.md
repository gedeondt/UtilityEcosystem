# Emisor e-commerce

Aplicación Node.js que simula el frontal web de contratación. Publica pedidos en el canal `ecommerce` del gestor de colas.

## Uso

```bash
node app.js [pedidosPorIntervalo] [maximoPedidos]
```

- `pedidosPorIntervalo` (opcional) define cuántos pedidos se envían en cada intervalo. Por defecto se envía 1.
- `maximoPedidos` (opcional) establece un límite total de pedidos a emitir. Por defecto no hay límite.

Variables de entorno relevantes:

- `EVENTLOG_ENDPOINT`: URL del endpoint `events` del gestor de colas (por defecto `http://localhost:3050/events`).
- `ECOMMERCE_CHANNEL`: canal al que se publican los pedidos (por defecto `ecommerce`).
- `ECOMMERCE_INTERVAL_MS`: intervalo en milisegundos entre emisiones (por defecto 10000).
- `TE_VERBOSE=true`: activa trazas detalladas.

Al iniciar, el emisor genera pedidos con la misma estructura que consumía el CRM cuando generaba datos sintéticos, de modo que el CRM pueda incorporarlos directamente.
