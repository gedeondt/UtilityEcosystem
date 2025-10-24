# CRM Simulado

Aplicación Node.js minimalista que simula el CRM de una comercializadora de energía. Genera datos en memoria de clientes, cuentas de facturación, puntos de suministro y contratos.

## Uso

```bash
node app.js [cantidad] [maximo]
```

- `cantidad` es opcional y define cuántos nuevos clientes (junto con su cuenta, punto y contrato) se generan cada 10 segundos. Por defecto se crea 1.
- `maximo` es opcional y fija el límite total de clientes a generar. Cuando se alcanza, se detiene la generación automática.

La aplicación expone un servidor HTTP en el puerto `3000` (configurable mediante la variable de entorno `PORT`).

## Endpoints disponibles

- `GET /clients`
- `GET /billing-accounts`
- `GET /supply-points`
- `GET /contracts`

Todos los recursos aceptan paginación mediante parámetros de consulta:

- `page`: página a devolver (1 por defecto).
- `perPage`: número de elementos por página (25 por defecto).

La respuesta incluye la porción de datos solicitada en la propiedad `data`, además de un objeto `pagination` con `page`, `perPage`, `totalItems` y `totalPages`.

## Datos generados

Cada cliente generado incluye:

- Datos personales y de contacto.
- Cuenta de facturación vinculada, con IBAN, dirección y método de pago.
- Punto de suministro asociado con CUPS, tipo de suministro y distribuidora.
- Contrato vigente que relaciona los recursos anteriores, con información tarifaria y fechas.
