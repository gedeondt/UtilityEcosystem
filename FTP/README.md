# Servidor FTP generador de ficheros P5D

Este proyecto levanta un servicio Node.js que expone un servidor FTP totalmente funcional gracias a la librería [`ftp-srv`](https://github.com/trs/ftp-srv).
El servicio consulta el CRM existente cada minuto (configurable), obtiene todos los contratos activos y genera un fichero P5D por
contrato. Los ficheros se almacenan en disco dentro del directorio `FTP/ftp-data`, que actúa como raíz del servidor FTP.

## Requisitos

- Node.js 18 o superior (para disponer de `fetch` nativo).

## Puesta en marcha

1. Instala las dependencias del CRM y lánzalo si todavía no lo está. Desde la carpeta `CRM`:

   ```bash
   npm install
   npm start
   ```

   El CRM escucha por defecto en `http://localhost:3000` y genera contratos de forma periódica.

2. Instala las dependencias y arranca el servidor FTP. Desde la carpeta `FTP`:

   ```bash
   npm install
   node app.js --crm-host localhost --crm-port 3000 --ftp-port 2121 --poll-interval 60000
   ```

   Todos los parámetros son opcionales:

   - `--crm-host`: host donde vive el CRM (por defecto `localhost`).
   - `--crm-port`: puerto del CRM (por defecto `3000`).
   - `--ftp-port`: puerto donde escuchará el servidor FTP (por defecto `2121`).
   - `--poll-interval`: intervalo en milisegundos entre lecturas del CRM (por defecto 60000).

   En cada iteración se genera un lote de ficheros utilizando una fecha que comienza en el día actual y avanza un día adicional
   en cada ciclo.

## Uso del FTP

Puedes conectarte con cualquier cliente FTP estándar (por ejemplo `ftp`, `lftp`, FileZilla, etc.) apuntando a `ftp://localhost:2121`
(o al puerto configurado mediante `--ftp-port`). El servidor permite acceso anónimo y expone como raíz la carpeta `ftp-data`.

Algunas operaciones útiles desde un cliente de línea de comandos:

```bash
ftp localhost 2121
# usuario: anonymous, contraseña vacía
ftp> ls
ftp> get P5D_<ID_CONTRATO>_<FECHA>.txt
ftp> delete P5D_<ID_CONTRATO>_<FECHA>.txt
```

Cada fichero generado sigue la estructura:

```
P5D|<contractId>|<fechaYYYYMMDD>|<supplyPointId>
00;<consumo kWh>
01;<consumo kWh>
...
23;<consumo kWh>
```

## Notas

- Los ficheros se almacenan en disco dentro de `FTP/ftp-data`. Puedes realizar copias de seguridad o limpiar el directorio cuando sea necesario.
- Si la petición al CRM falla, el ciclo se reintentará en la siguiente iteración sin detener el servidor FTP.
- El listado de contratos se pagina automáticamente hasta recuperar todos los activos.
