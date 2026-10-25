#!/bin/bash
# Publica coletor, agregador e site no Vultr (sem --delete: outros processos podem editar arquivos lá).
set -e
cd "$(dirname "$0")"
mkdir -p site/codigo
for f in coletor.py agregar.py gtfs_ref.py verificar_manifesto.py; do cp servidor/$f site/codigo/$f.txt; done
cp servidor/atualizar_gtfs.sh site/codigo/atualizar_gtfs.sh.txt
ssh vultr 'mkdir -p /opt/analise-onibus /var/lib/analise-onibus /var/www/travahacker/analise-onibus/data /var/www/travahacker/analise-onibus/codigo'
rsync -a servidor/coletor.py servidor/agregar.py servidor/gtfs_ref.py servidor/atualizar_gtfs.sh vultr:/opt/analise-onibus/
rsync -a site/index.html site/app.js site/pedido.html site/pedido-sptrans.txt site/favicon.svg site/apple-touch-icon.png site/og.png site/voluntariado-ticker.css site/temas.css vultr:/var/www/travahacker/analise-onibus/
rsync -a site/codigo/ vultr:/var/www/travahacker/analise-onibus/codigo/
rsync -a servidor/analise-onibus.cron vultr:/etc/cron.d/analise-onibus
ssh vultr 'chown -R nginx:nginx /var/www/travahacker/analise-onibus; chmod 755 /var/www/travahacker/analise-onibus /var/www/travahacker/analise-onibus/data /var/www/travahacker/analise-onibus/codigo; chmod 644 /var/www/travahacker/analise-onibus/codigo/*; chmod 644 /var/www/travahacker/analise-onibus/*.*; restorecon -R /var/www/travahacker/analise-onibus /etc/cron.d/analise-onibus 2>/dev/null; chown root:root /etc/cron.d/analise-onibus /opt/analise-onibus/*.py; chmod 644 /etc/cron.d/analise-onibus; [ -f /etc/analise-onibus.env ] || { echo "SPTRANS_TOKEN=" > /etc/analise-onibus.env; chmod 600 /etc/analise-onibus.env; }'
