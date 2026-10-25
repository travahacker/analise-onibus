#!/bin/bash
# Baixa o GTFS público da SPTrans, guarda cópia datada e regenera data/gtfs_ref.json.
set -e
D=/var/lib/analise-onibus/gtfs
OUT=/var/www/travahacker/analise-onibus/data
mkdir -p "$D"
F="$D/$(date +%F).zip"
curl -sf -m 300 -A "Mozilla/5.0 (X11; Linux x86_64) analise-onibus/1.0" -o "$F.tmp" \
  "https://www.sptrans.com.br/umbraco/Surface/PerfilDesenvolvedor/BaixarGTFS?memberName=_sptrans"
python3.11 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).testzip()" "$F.tmp"
mv "$F.tmp" "$F"
sha256sum "$F" >> "$D/SHA256SUMS"
python3.11 /opt/analise-onibus/gtfs_ref.py "$F" "$OUT/gtfs_ref.json.tmp"
chmod 644 "$OUT/gtfs_ref.json.tmp"; mv "$OUT/gtfs_ref.json.tmp" "$OUT/gtfs_ref.json"
