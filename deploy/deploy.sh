#!/bin/bash
# ============================================================
# ModuShare 업데이트 배포 스크립트
# 로컬 맥에서 실행: bash deploy/deploy.sh
# ============================================================
set -euo pipefail

SERVER_IP="35.184.146.218"
SERVER_USER="root"          # 서버 접속 사용자 (필요 시 변경)
APP_DIR="/opt/modushare"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }

log "ModuShare 배포 시작..."
log "로컬 소스: $LOCAL_DIR"
log "서버: $SERVER_USER@$SERVER_IP:$APP_DIR"

# ── 1. 소스 업로드 ───────────────────────────────────────────
log "소스 파일 업로드 중 (rsync)..."
rsync -az --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='**/node_modules' \
  --exclude='.env' \
  --exclude='*/dist' \
  --exclude='clients' \
  --exclude='modushare/modushare' \
  "$LOCAL_DIR/" \
  "$SERVER_USER@$SERVER_IP:$APP_DIR/"

log "업로드 완료"

# ── 2. 서버에서 빌드 및 재시작 ───────────────────────────────
log "서버에서 Docker 이미지 재빌드 및 재시작 중..."
ssh "$SERVER_USER@$SERVER_IP" bash <<REMOTE
  set -e
  cd $APP_DIR

  echo "[server] 이미지 빌드 중..."
  docker compose build

  echo "[server] 컨테이너 재시작..."
  docker compose up -d --force-recreate

  echo "[server] 헬스체크 대기 (15초)..."
  sleep 15

  echo "[server] 컨테이너 상태:"
  docker compose ps

  echo "[server] 최근 로그:"
  docker compose logs --tail=20
REMOTE

log "배포 완료!"
log "서비스 URL: https://modushare.extory.co"
