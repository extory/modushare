#!/bin/bash
# ============================================================
# ModuShare 업데이트 배포 스크립트
# 로컬 맥에서 실행: bash deploy/deploy.sh
# ============================================================
set -euo pipefail

SERVER_IP="35.184.146.218"
SERVER_USER="nick"
APP_DIR="/opt/modushare"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[deploy]${NC} $*"; }

log "ModuShare 배포 시작..."
log "서버: $SERVER_USER@$SERVER_IP"

ssh "$SERVER_USER@$SERVER_IP" bash <<REMOTE
  set -e
  cd $APP_DIR

  echo "[server] 최신 코드 pull 중..."
  sudo git fetch origin
  sudo git reset --hard origin/main

  echo "[server] Docker 이미지 재빌드 중..."
  sudo -E docker compose build

  echo "[server] 컨테이너 재시작..."
  sudo -E docker compose up -d --force-recreate

  echo "[server] 헬스체크 대기 (15초)..."
  sleep 15

  echo "[server] 컨테이너 상태:"
  sudo docker compose ps

  echo "[server] 최근 로그:"
  sudo docker compose logs --tail=20
REMOTE

log "배포 완료!"
log "서비스 URL: https://modushare.extory.co"
