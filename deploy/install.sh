#!/bin/bash
# ============================================================
# ModuShare 서버 최초 설치 스크립트
# Ubuntu 22.04 LTS 기준
# 사용법: sudo bash install.sh
# ============================================================
set -euo pipefail

DOMAIN="modushare.extory.co"
APP_DIR="/opt/modushare"
REPO_URL=""   # git clone 사용 시 채워주세요 (또는 scp로 업로드)

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[modushare]${NC} $*"; }
warn() { echo -e "${YELLOW}[modushare]${NC} $*"; }
err()  { echo -e "${RED}[modushare]${NC} $*" >&2; }

# ── 1. 루트 권한 확인 ────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  err "이 스크립트는 root 권한으로 실행해야 합니다: sudo bash install.sh"
  exit 1
fi

# ── 2. 시스템 패키지 업데이트 ────────────────────────────────
log "시스템 패키지 업데이트 중..."
apt-get update -qq
apt-get install -y -qq curl git nginx certbot python3-certbot-nginx ufw

# ── 3. Docker 설치 (없는 경우) ───────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Docker 설치 중..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  log "Docker 이미 설치됨: $(docker --version)"
fi

if ! command -v docker compose &>/dev/null; then
  log "Docker Compose 플러그인 설치 중..."
  apt-get install -y -qq docker-compose-plugin
fi

# ── 4. 방화벽 설정 ───────────────────────────────────────────
log "UFW 방화벽 설정 중..."
ufw --force enable
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
# 내부 포트(3001, 3010)는 외부에 노출하지 않음

# ── 5. 앱 디렉터리 준비 ──────────────────────────────────────
log "앱 디렉터리 준비: $APP_DIR"
mkdir -p "$APP_DIR"

if [[ -n "$REPO_URL" ]]; then
  if [[ -d "$APP_DIR/.git" ]]; then
    git -C "$APP_DIR" pull
  else
    git clone "$REPO_URL" "$APP_DIR"
  fi
else
  warn "REPO_URL이 비어 있습니다. 파일을 수동으로 $APP_DIR 에 업로드하세요."
  warn "예: scp -r ./modushare root@35.184.146.218:/opt/modushare"
fi

# ── 6. .env 설정 ─────────────────────────────────────────────
if [[ ! -f "$APP_DIR/.env" ]]; then
  log ".env 파일 생성 중..."
  JWT_SECRET=$(openssl rand -hex 32)
  cat > "$APP_DIR/.env" <<EOF
JWT_SECRET=$JWT_SECRET
PORT=3010
CORS_ORIGIN=https://$DOMAIN
MAX_CLIPBOARD_SIZE_MB=5
WEB_DIST_PATH=/app/web/dist
EOF
  log ".env 생성 완료 (JWT_SECRET 자동 생성됨)"
  log "파일 위치: $APP_DIR/.env"
else
  warn ".env 파일이 이미 존재합니다. 덮어쓰지 않습니다."
fi

# ── 7. Nginx 설정 ────────────────────────────────────────────
log "Nginx 설정 복사 중..."
cp "$APP_DIR/deploy/nginx/$DOMAIN.conf" "/etc/nginx/sites-available/$DOMAIN.conf"
ln -sf "/etc/nginx/sites-available/$DOMAIN.conf" "/etc/nginx/sites-enabled/$DOMAIN.conf"

# 기본 nginx 사이트 비활성화
rm -f /etc/nginx/sites-enabled/default

# SSL 발급 전 임시로 HTTP만 허용하는 설정으로 교체 (certbot 필요)
log "SSL 인증서 발급 전 임시 HTTP 설정 적용..."
cat > "/etc/nginx/sites-available/$DOMAIN.conf" <<'NGINX_TEMP'
server {
    listen 80;
    server_name modushare.extory.co;

    client_max_body_size 20M;

    location / {
        proxy_pass         http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_read_timeout  3600s;
        proxy_send_timeout  3600s;
    }
}
NGINX_TEMP

nginx -t && systemctl reload nginx
log "Nginx 임시 설정 완료"

# ── 8. Docker 이미지 빌드 및 실행 ────────────────────────────
log "Docker 이미지 빌드 중 (시간이 걸릴 수 있습니다)..."
cd "$APP_DIR"
docker compose build

log "컨테이너 시작 중..."
docker compose up -d

log "컨테이너 상태:"
docker compose ps

# ── 9. SSL 인증서 발급 ───────────────────────────────────────
log "Let's Encrypt SSL 인증서 발급 중..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@extory.co" || {
  warn "SSL 발급 실패. 도메인 DNS가 이 서버를 가리키는지 확인하세요."
  warn "수동 발급: certbot --nginx -d $DOMAIN"
}

# ── 10. 자동 갱신 설정 ───────────────────────────────────────
if ! crontab -l 2>/dev/null | grep -q certbot; then
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -
  log "SSL 자동 갱신 크론 등록 완료"
fi

echo ""
echo "============================================================"
log "설치 완료!"
echo "  서비스 URL : https://$DOMAIN"
echo "  앱 디렉터리: $APP_DIR"
echo "  로그 확인  : docker compose -f $APP_DIR/docker-compose.yml logs -f"
echo "============================================================"
