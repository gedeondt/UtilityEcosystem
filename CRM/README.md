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

Todos los recursos son de solo lectura y devuelven colecciones paginadas.

### Parámetros de paginación

- `page`: página a devolver (1 por defecto).
- `perPage`: número de elementos por página (25 por defecto).

Las respuestas tienen la forma:

```json
{
  "data": [ /* elementos de la colección */ ],
  "pagination": {
    "page": 1,
    "perPage": 25,
    "totalItems": 125,
    "totalPages": 5
  }
}
```

### `GET /clients`

Devuelve clientes con sus datos personales y de contacto.

```json
{
  "id": "uuid",
  "fullName": "Nombre Apellido",
  "documentId": "X1234567Y",
  "email": "nombre.apellido@ejemplo.com",
  "phone": "+34600000000",
  "address": {
    "street": "Gran Vía 123",
    "city": "Madrid",
    "postalCode": "28001",
    "country": "España"
  },
  "createdAt": "2024-01-01T10:00:00.000Z"
}
```

### `GET /billing-accounts`

Devuelve las cuentas de facturación asociadas a los clientes.

```json
{
  "id": "uuid",
  "clientId": "uuid del cliente",
  "iban": "ES0012345678901234567890",
  "billingAddress": {
    "street": "Gran Vía 123",
    "city": "Madrid",
    "postalCode": "28001",
    "country": "España"
  },
  "paymentMethod": "Domiciliación bancaria",
  "status": "ACTIVA",
  "createdAt": "2024-01-01T10:00:00.000Z"
}
```

### `GET /supply-points`

Devuelve los puntos de suministro vinculados a los clientes.

```json
{
  "id": "uuid",
  "clientId": "uuid del cliente",
  "cups": "ES00123456789012345678",
  "address": {
    "street": "Gran Vía 123",
    "city": "Madrid",
    "postalCode": "28001",
    "country": "España"
  },
  "supplyType": "Electricidad",
  "distributor": "Distribuidora Nacional",
  "contractedPowerKw": 5.5,
  "createdAt": "2024-01-01T10:00:00.000Z"
}
```

### `GET /contracts`

Devuelve los contratos que relacionan clientes, cuentas de facturación y puntos de suministro.

```json
{
  "id": "uuid",
  "clientId": "uuid del cliente",
  "billingAccountId": "uuid de la cuenta",
  "supplyPointId": "uuid del punto",
  "tariff": "Tarifa Plana 24h",
  "status": "VIGENTE",
  "pricePerKWh": 0.1345,
  "fixedFeeEurMonth": 12.34,
  "startDate": "2024-01-01T10:00:00.000Z",
  "endDate": "2025-01-01T10:00:00.000Z",
  "renewalType": "Renovación automática anual"
}
```

## Datos generados

Cada cliente generado incluye:

- Datos personales y de contacto.
- Cuenta de facturación vinculada, con IBAN, dirección y método de pago.
- Punto de suministro asociado con CUPS, tipo de suministro y distribuidora.
- Contrato vigente que relaciona los recursos anteriores, con información tarifaria y fechas.
