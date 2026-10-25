# Análise dos ônibus de São Paulo na eleição

Auditoria independente da circulação dos ônibus municipais de São Paulo no dia da eleição (2º turno, 25/10/2026), comparada a dias úteis e domingos normais. Usa a posição de GPS publicada pela API Olho Vivo, da SPTrans, e o GTFS oficial.

Painel publicado em <https://travahacker.com.br/analise-onibus/>.

## O que o projeto faz

1. **Coleta** (`servidor/coletor.py`): a cada 2 minutos consulta `/Posicao`, guarda a resposta original comprimida e registra um hash SHA-256 encadeado ao registro anterior em `manifest.jsonl`.
2. **Agregação** (`servidor/agregar.py`): lê o SQLite do coletor e gera os JSON que alimentam o painel (ônibus operando, em movimento e linhas ativas por janela de 10 minutos).
3. **GTFS** (`servidor/gtfs_ref.py`, `servidor/atualizar_gtfs.sh`): baixa o GTFS público da SPTrans, guarda cópia datada e extrai quais linhas têm serviço programado em dia útil, sábado e domingo.
4. **Verificação** (`servidor/verificar_manifesto.py`): refaz os hashes e confere que nenhuma coleta antiga foi alterada.
5. **Painel** (`site/`): página estática em HTML, CSS e JavaScript puro, sem bibliotecas externas.

A metodologia completa, com as definições e os limites, está no fim do painel.

## Definições

- **Operando:** ônibus ligado a uma linha, com posição atualizada nos últimos 3 minutos, visto ao mesmo tempo. Inclui os parados em ponto final e exclui garagem e ônibus sem GPS. É uma foto simultânea, não o total que rodou no dia.
- **Em movimento:** operando e deslocado ao menos 50 m desde a coleta anterior.
- **Linha ativa:** letreiro de linha com ao menos um ônibus em movimento em 10 minutos.

O GTFS não serve para estimar frota por hora: a maior parte das viagens vale para todos os dias e `frequencies.txt` não distingue o dia. É usado só para saber quais linhas deveriam operar.

## Como rodar

Requisitos: Python 3.9 ou mais novo (só biblioteca padrão), cron ou systemd, e uma credencial da API Olho Vivo. O código não depende de nenhum assistente de IA.

```bash
export ONIBUS_DATA=/var/lib/analise-onibus     # dados brutos e SQLite
export ONIBUS_OUT=/var/www/analise-onibus/data # JSON do painel
# Modo gateway (APILIB, Prefeitura de SP): token renovado sozinho
export ONIBUS_MODO=gateway
export SPTRANS_CONSUMER_KEY=...
export SPTRANS_CONSUMER_SECRET=...
# ou um token fixo: SPTRANS_ACCESS_TOKEN=...
# Modo legado (api.olhovivo.sptrans.com.br): ONIBUS_MODO=legado e SPTRANS_TOKEN=...
python3 servidor/coletor.py     # uma coleta
python3 servidor/agregar.py     # regenera os JSON
python3 servidor/verificar_manifesto.py "$ONIBUS_DATA"
```

`servidor/analise-onibus.cron` traz o agendamento usado em produção. `deploy.sh` publica em um servidor acessível por `ssh vultr`; adapte o alias e os caminhos ao seu ambiente.

Atenção: o Cloudflare da SPTrans bloqueia o User-Agent padrão do Python (erro 403), então o coletor se identifica com um User-Agent de navegador.

## Dependências externas e substituição

- **API Olho Vivo / gateway APILIB (SPTrans, Prefeitura de SP):** única fonte de posição em tempo real. Não há substituto público. O modo de autenticação é configurável para alternar entre o endpoint antigo e o gateway.
- **GTFS da SPTrans:** público, sem login.
- Dados em SQLite, JSON e arquivos `.json.gz`, formatos abertos e portáveis.

## Limites

- Não há histórico público de GPS: só medimos a partir do início da coleta.
- Menos ônibus ou linhas não prova intenção de ninguém nem, sozinho, descumprimento de decisão judicial.
- O painel compara números de fontes diferentes sem misturá-los, porque medem coisas diferentes.

## Dados oficiais

`site/pedido-sptrans.txt` é um modelo de pedido de acesso à informação (Lei 12.527/2011) para obter da SPTrans os registros operacionais de 04/10, 18/10 e 25/10/2026.

## Licença

MIT. Veja `LICENSE`.
