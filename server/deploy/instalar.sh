#!/usr/bin/env bash
# Instalación / actualización del backend de Las Delicias en el servidor (Hetzner OrPiRa-Cloud).
#
# Uso (como root o con sudo; las variables van DESPUÉS de sudo):
#   curl -fsSL https://raw.githubusercontent.com/Orpira/lasdelicias/main/server/deploy/instalar.sh \
#     | sudo ADMIN_EMAIL=tu@email.es ADMIN_NOMBRE="Tu nombre" bash
# o, con el repo ya clonado:
#   sudo bash /opt/lasdelicias/server/deploy/instalar.sh
#
# Variables opcionales:
#   RAMA=main                                   rama a desplegar
#   API_DOMINIO=api-delicias.orpira.es          dominio público de la API
#   FRONT_ORIGENES="https://lasdelicias.vercel.app"   dominios del frontend (separados por comas)
#   N8N_WEBHOOK_URL=https://n8n.orpira.es/webhook/las-delicias
#   ADMIN_EMAIL=dueno@lasdelicias.es ADMIN_NOMBRE="Dueño"   crea la cuenta de administración
set -euo pipefail

RAMA="${RAMA:-main}"
DIR="${DIR:-/opt/lasdelicias}"
API_DOMINIO="${API_DOMINIO:-api-delicias.orpira.es}"
FRONT_ORIGENES="${FRONT_ORIGENES:-https://lasdelicias.vercel.app}"
N8N_WEBHOOK_URL="${N8N_WEBHOOK_URL:-}"
REPO="https://github.com/Orpira/lasdelicias.git"

verde() { printf '\033[32m%s\033[0m\n' "$*"; }
amarillo() { printf '\033[33m%s\033[0m\n' "$*"; }
rojo() { printf '\033[31m%s\033[0m\n' "$*" >&2; }

# 1. Requisitos
[ "$(id -u)" -eq 0 ] || { rojo "Ejecuta el instalador con sudo (… | sudo bash)"; exit 1; }
command -v docker >/dev/null || { rojo "Docker no está instalado: curl -fsSL https://get.docker.com | sh"; exit 1; }
docker compose version >/dev/null 2>&1 || { rojo "Falta el plugin docker compose"; exit 1; }
command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git; }
command -v openssl >/dev/null || { apt-get update -qq && apt-get install -y -qq openssl; }

# 2. Código
if [ -d "$DIR/.git" ]; then
	verde "→ Actualizando código ($RAMA)"
	git -C "$DIR" fetch --quiet origin "$RAMA"
	git -C "$DIR" checkout --quiet "$RAMA"
	git -C "$DIR" pull --quiet --ff-only origin "$RAMA"
else
	verde "→ Descargando código en $DIR ($RAMA)"
	git clone --quiet --branch "$RAMA" "$REPO" "$DIR"
fi
cd "$DIR/server"

# 3. Secretos (solo la primera vez: nunca se sobrescribe un .env existente)
secreto() { openssl rand -base64 36 | tr -d '/+=' | cut -c1-40; }
if [ ! -f .env ]; then
	verde "→ Generando .env con secretos nuevos"
	cp .env.example .env
	sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secreto)|" .env
	sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(secreto)|" .env
	sed -i "s|^N8N_WEBHOOK_SECRET=.*|N8N_WEBHOOK_SECRET=$(secreto)|" .env
	sed -i "s|^N8N_API_KEY=.*|N8N_API_KEY=$(secreto)|" .env
	sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=$FRONT_ORIGENES|" .env
	sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://$API_DOMINIO|" .env
	sed -i "s|^N8N_WEBHOOK_URL=.*|N8N_WEBHOOK_URL=$N8N_WEBHOOK_URL|" .env
	chmod 600 .env
else
	amarillo "→ .env ya existe: se conserva tal cual"
fi

# 4. Red compartida con el proxy (Nginx Proxy Manager) y n8n
fijar_env() { # fijar_env CLAVE valor → sustituye o añade en .env
	if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}
redes_de() { docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$1" 2>/dev/null; }

NPM=$(docker ps --format '{{.Names}} {{.Image}}' | awk 'tolower($2) ~ /nginx-proxy-manager/ {print $1; exit}')
N8N=$(docker ps --format '{{.Names}} {{.Image}}' | awk 'tolower($2) ~ /n8nio\/n8n|^n8n/ {print $1; exit}')
RED=""
if [ -n "$NPM" ]; then
	REDES_NPM=$(redes_de "$NPM")
	REDES_N8N=$([ -n "$N8N" ] && redes_de "$N8N" || true)
	# Preferencia: una red que compartan NPM y n8n; si no, la primera de NPM (salvo "bridge")
	for r in $REDES_NPM; do
		[ "$r" = "bridge" ] && continue
		if echo " $REDES_N8N " | grep -q " $r "; then RED="$r"; break; fi
	done
	if [ -z "$RED" ]; then
		for r in $REDES_NPM; do [ "$r" != "bridge" ] && { RED="$r"; break; }; done
	fi
	if [ -z "$RED" ]; then
		# NPM solo está en la red "bridge" por defecto (sin DNS entre contenedores): creamos una
		RED="lasdelicias-proxy"
		docker network inspect "$RED" >/dev/null 2>&1 || docker network create "$RED" >/dev/null
		docker network connect "$RED" "$NPM" 2>/dev/null || true
		amarillo "→ Nginx Proxy Manager conectado a la red $RED"
	fi
	verde "→ Nginx Proxy Manager detectado ($NPM), red compartida: $RED"
else
	RED="lasdelicias-proxy"
	docker network inspect "$RED" >/dev/null 2>&1 || docker network create "$RED" >/dev/null
fi
fijar_env PROXY_NETWORK "$RED"

# n8n en la misma red → la API le avisa por la red interna
if [ -n "$N8N" ] && echo " $(redes_de "$N8N") " | grep -q " $RED "; then
	if ! grep -q '^N8N_WEBHOOK_URL=.\+' .env; then
		fijar_env N8N_WEBHOOK_URL "http://$N8N:5678/webhook/las-delicias"
		verde "→ n8n en la misma red: eventos a http://$N8N:5678/webhook/las-delicias"
	fi
fi

# 5. Arranque
verde "→ Construyendo y arrancando contenedores"
docker compose up -d --build

printf "→ Esperando a la API"
for _ in $(seq 1 60); do
	if curl -fs http://127.0.0.1:3001/health >/dev/null 2>&1; then echo; verde "→ API en marcha"; break; fi
	printf "."; sleep 2
done
curl -fs http://127.0.0.1:3001/health >/dev/null || { echo; rojo "La API no responde. Revisa: docker compose logs api"; exit 1; }

# 6. Cuenta de administración (opcional)
if [ -n "${ADMIN_EMAIL:-}" ]; then
	if [ -t 0 ] || [ -e /dev/tty ]; then
		read -r -s -p "Contraseña para $ADMIN_EMAIL (mín. 10 caracteres): " CLAVE < /dev/tty; echo
		docker compose exec -T -e STAFF_PASSWORD="$CLAVE" api node scripts/crear-staff.js "$ADMIN_EMAIL" "${ADMIN_NOMBRE:-Administración}" admin
		unset CLAVE
	fi
fi

# 7. Proxy HTTPS: detectar qué hay y dar el paso exacto
echo
verde "=== Siguiente paso: publicar https://$API_DOMINIO ==="
if [ -n "$NPM" ]; then
	cat <<NPM_PASOS
En Nginx Proxy Manager (http://IP-del-servidor:81) → Hosts → Proxy Hosts → Add Proxy Host:
  Details:
    Domain Names ........ $API_DOMINIO
    Scheme .............. http
    Forward Hostname/IP . lasdelicias-api
    Forward Port ........ 3001
    Block Common Exploits  ✔
    Websockets Support     ✔
  SSL:
    Request a new SSL Certificate ✔   Force SSL ✔   HTTP/2 ✔   (acepta los términos)
  Advanced → Custom Nginx Configuration (tiempo real y fotos):
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
    client_max_body_size 6m;
NPM_PASOS
elif command -v caddy >/dev/null || docker ps --format '{{.Image}}' | grep -qi caddy; then
	echo "Caddy detectado. Añade a tu Caddyfile y recarga:"
	sed "s/api-delicias.orpira.es/$API_DOMINIO/" deploy/Caddyfile.ejemplo
elif command -v nginx >/dev/null; then
	echo "Nginx detectado. Ejecuta:"
	echo "  sed 's/api-delicias.orpira.es/$API_DOMINIO/' $DIR/server/deploy/nginx.ejemplo.conf > /etc/nginx/sites-available/$API_DOMINIO"
	echo "  ln -sf /etc/nginx/sites-available/$API_DOMINIO /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx"
	echo "  certbot --nginx -d $API_DOMINIO"
elif docker ps --format '{{.Image}}' | grep -qi traefik; then
	echo "Traefik detectado: añade al servicio 'api' de docker-compose.yml las etiquetas de host '$API_DOMINIO'"
	echo "y conéctalo a la red de Traefik (ver DESPLIEGUE.md)."
else
	amarillo "No se detectó proxy. Ver server/DESPLIEGUE.md, sección 4."
fi

echo
verde "=== Datos para configurar n8n ==="
grep -E '^(N8N_WEBHOOK_SECRET|N8N_API_KEY)=' .env
echo
verde "Listo. Comprueba: curl https://$API_DOMINIO/negocio"
