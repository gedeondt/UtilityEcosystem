# Transformaciones del datalake

Este directorio alberga los scripts responsables de transformar los datos desde la capa *landing* hacia la capa *silver* del datalake. Cada proceso de transformación debe vivir aquí y documentarse adecuadamente.

## Scripts disponibles

- `p5d_to_parquet.js`: convierte los ficheros P5D procedentes del FTP en datasets Parquet de la capa *silver*.
