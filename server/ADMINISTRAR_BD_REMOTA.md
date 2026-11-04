# Administrar PostgreSQL remotamente

La base de datos de Las Delicias **no se expone a Internet**. PostgreSQL está
en una red privada de Docker y solo debe administrarse mediante un túnel SSH.

Puedes usar **pgAdmin 4** o **DBeaver**. DBeaver suele ser más ligero; pgAdmin
ofrece una administración específica de PostgreSQL.

## 1. Publicar PostgreSQL solo en localhost

En el servidor, edita `/opt/lasdelicias/server/docker-compose.yml` y añade
esta sección dentro del servicio `db`:

```yaml
ports:
  - "127.0.0.1:5432:5432"
```

Aplica el cambio:

```bash
cd /opt/lasdelicias/server
sudo docker compose up -d db
```

La dirección `127.0.0.1` es importante: no usar `0.0.0.0:5432`.

## 2. Crear el túnel SSH desde tu ordenador

Mantén esta terminal abierta mientras uses pgAdmin o DBeaver:

```bash
ssh -N -L 15432:127.0.0.1:5432 USUARIO_SSH@167.233.139.93
```

Sustituye `USUARIO_SSH` por tu usuario del servidor. El puerto local `15432`
se conecta al PostgreSQL remoto mediante SSH cifrado.

## 3. Configurar pgAdmin 4

En **Add New Server** configura:

```text
Name:     Las Delicias producción
Host:     127.0.0.1
Port:     15432
Database: delicias
Username: delicias
Password: valor de POSTGRES_PASSWORD en /opt/lasdelicias/server/.env
```

## 4. Configurar DBeaver

Selecciona PostgreSQL y usa los mismos valores:

```text
Host:     127.0.0.1
Port:     15432
Database: delicias
Username: delicias
Password: valor de POSTGRES_PASSWORD en /opt/lasdelicias/server/.env
```

También puedes configurar el túnel desde **SSH** en la pestaña correspondiente
de DBeaver:

```text
SSH host: 167.233.139.93
SSH port: 22
Local port: 15432
Remote host: 127.0.0.1
Remote port: 5432
```

## Seguridad y operación

- No abras el puerto `5432` en el firewall.
- No publiques PostgreSQL en Nginx Proxy Manager.
- No compartas la contraseña de `.env`.
- Usa consultas `SELECT` por defecto y evita modificar producción directamente.
- Haz una copia antes de cambios manuales:

```bash
sudo docker exec lasdelicias-db pg_dump -U delicias -d delicias -Fc > respaldo-manual.dump
```

- Para cerrar el túnel, pulsa `Ctrl+C` en la terminal SSH.
- La base de datos de pruebas debe ser independiente; nunca uses producción
  para ejecutar la suite de tests.
