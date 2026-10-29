# Formato dos dados

Tudo em formatos abertos: JSON, JSON Lines, gzip e SQLite.

## Pasta de dados do coletor (`ONIBUS_DATA`)

| Caminho | Conteúdo |
|---|---|
| `raw/AAAA-MM-DD/<ts>.json.gz` | Resposta original de `/Posicao`, sem alteração, comprimida. `ts` é o instante da coleta em segundos Unix (UTC). |
| `manifest.jsonl` | Uma linha JSON por coleta: `ts`, `arquivo`, `sha256`, `bytes`, `encadeado`. |
| `db.sqlite` | Agregados para o painel (tabelas abaixo). |
| `gtfs/AAAA-MM-DD.zip` e `SHA256SUMS` | Cópia datada do GTFS e os respectivos hashes (criados por `atualizar_gtfs.sh`). |
| `token_cache.json` | Token Bearer em cache, no modo gateway. Não versionar. |

### Cadeia de hashes (`manifest.jsonl`)

Para cada coleta, `sha256` é o hash da resposta **descomprimida** e `encadeado = sha256(encadeado_anterior + sha256)`, com `encadeado_anterior = ""` na primeira. Alterar qualquer coleta antiga muda todos os `encadeado` seguintes. `servidor/verificar_manifesto.py PASTA` refaz as contas.

### Tabelas do SQLite

| Tabela | Colunas | Uso |
|---|---|---|
| `snap` | `ts`, `total`, `frescos`, `movidos`, `linhas`, `sha` | Uma linha por coleta. `frescos` = veículos com posição atualizada há até 3 min. `movidos` = deslocados 50 m ou mais desde a coleta anterior. |
| `pos` | `p`, `lat`, `lon`, `ts` | Última posição de cada prefixo, para detectar movimento. |
| `veic` | `bucket`, `p`, `cl`, `c`, `zona`, `movido` | Um registro por veículo e janela de 10 minutos (`bucket` = início da janela, segundos Unix). |

Observação: `snap.linhas` conta letreiros em movimento só nas coletas feitas depois da correção de 25/10/2026 (antes contava `cl`). O painel usa `veic`, não esse campo.

## JSON publicados no painel (`ONIBUS_OUT`)

- `series.json`: `{gerado, janela, coletas, primeira, ultima, ultima_coleta, dias: [{data, dow, serie: [{h, mov, fres, lin, op, mv, z}]}]}`. `h` é a hora local decimal do início da janela (16.5 = 16h30). `op` = ônibus operando (média das coletas da janela), `mv` = em movimento (média, só coletas espaçadas de 90 s a 10 min), `lin` = letreiros distintos em movimento, `z` = ônibus em movimento por zona.
- `linhas.json`: `{AAAA-MM-DD: {letreiro: média de ônibus em movimento na janela de votação}}`.
- `gtfs_ref.json`: `{tipos: {util|sabado|domingo: {linhas, rotas: [route_id]}}}`, linhas com serviço programado por tipo de dia.
- `comparacao.json`: o dia do evento (`ONIBUS_EVENTO`) comparado aos dias úteis, só nas janelas de 10 minutos em que o evento foi medido. Entram como referência os dias úteis (seg a sex, fora de `FERIADOS` em `agregar.py`) que cobrem pelo menos 95% dessa janela. Campos: `janela` (início, fim e número de janelas), `uteis` (datas de referência), `onibus_operando`, `em_movimento` e `linhas_ativas_por_janela` (cada um com `evento`, `media_uteis`, `razao`, `por_dia`, e `por_hora` para o primeiro) e `linhas` (letreiros em movimento no total, entre as linhas que só existem em dia útil, e a lista `ausentes_na_eleicao`: linhas com ônibus em movimento em todos os dias úteis e em nenhuma janela do evento).
- `manifesto.json`: os 50 últimos registros do manifesto, para conferência pública.

## Formato da API de origem

Veja `exemplos/posicao_amostra.json` (fictício) e a [documentação oficial do Olho Vivo](https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/).

## Zonas

Aproximação por distância e direção da Praça da Sé (-23.5505, -46.6333): `Centro` até 4 km, depois `Norte|Sul|Leste|Oeste` com `intermediária` até 10 km e `periférica` além disso. Não são os distritos oficiais.
