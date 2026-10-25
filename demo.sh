#!/bin/bash
# Demonstração local, sem credenciais: sobe a API simulada, faz 4 coletas, agrega, confere
# a cadeia de hashes e abre o painel em http://127.0.0.1:8000/
set -e
cd "$(dirname "$0")"
PORTA_API=${PORTA_API:-8787}; PORTA_SITE=${PORTA_SITE:-8000}
export ONIBUS_DATA=${ONIBUS_DATA:-$PWD/.demo-dados} ONIBUS_OUT=$PWD/site/data
export ONIBUS_MODO=gateway SPTRANS_ACCESS_TOKEN=teste OLHOVIVO_BASE=http://127.0.0.1:$PORTA_API
mkdir -p "$ONIBUS_DATA" "$ONIBUS_OUT"
python3 servidor/api_simulada.py "$PORTA_API" >/dev/null &
API=$!; trap 'kill $API 2>/dev/null' EXIT
sleep 1
for i in 1 2 3 4; do python3 servidor/coletor.py; sleep 2; done
python3 servidor/agregar.py
python3 servidor/verificar_manifesto.py "$ONIBUS_DATA"
echo "Painel em http://127.0.0.1:$PORTA_SITE/  (Ctrl+C para sair). Os dados são fictícios."
python3 -m http.server "$PORTA_SITE" --directory site
