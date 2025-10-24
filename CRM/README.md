# CRM Simulado

Aplicación Node.js minimalista que simula el CRM de una comercializadora de energía. Genera datos en memoria de clientes, cuentas de facturación, puntos de suministro y contratos.

## Uso

```bash
node app.js [cantidad]
```

- `cantidad` es opcional y define cuántos nuevos clientes (junto con su cuenta, punto y contrato) se generan cada 10 segundos. Por defecto se crea 1.

La aplicación expone un servidor HTTP en el puerto `3000` (configurable mediante la variable de entorno `PORT`).

## Endpoints disponibles

- `GET /clients`
- `GET /billing-accounts`
- `GET /supply-points`
- `GET /contracts`

Todos los recursos devuelven la colección completa en memoria.

## Datos generados

Cada cliente generado incluye:

- Datos personales y de contacto.
- Cuenta de facturación vinculada, con IBAN, dirección y método de pago.
- Punto de suministro asociado con CUPS, tipo de suministro y distribuidora.
- Contrato vigente que relaciona los recursos anteriores, con información tarifaria y fechas.
