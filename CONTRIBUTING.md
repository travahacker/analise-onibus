# Como contribuir

Obrigado por querer ajudar. O projeto é pequeno de propósito: só biblioteca padrão do Python e JavaScript puro.

## Antes de começar

```bash
python3 -m unittest discover -s tests -v   # testes
./demo.sh                                  # painel local com dados fictícios, sem credenciais
```

## Regras do projeto

- **Sem dependências externas** no coletor, na agregação e no painel (nada de pip install, npm ou CDN). Isso mantém o projeto fácil de auditar e de rodar em qualquer servidor.
- **Neutralidade.** O painel mede e compara. Não acusa pessoas nem afirma intenção. Mudanças de texto que ampliem uma conclusão precisam citar a medição que a sustenta.
- **Todo número do painel precisa ser verificável** a partir dos dados brutos e do código publicado.
- **Nenhuma credencial no repositório**, nem em exemplos. Use variáveis de ambiente.
- Textos em português do Brasil.

## O que ajudaria

- Medianas e percentil 90 dos intervalos entre ônibus por linha e faixa horária.
- Importar registros históricos obtidos da SPTrans (CSV da LAI) para o mesmo esquema do SQLite.
- Exportação dos agregados em CSV.
- Testes para o `site/app.js`.
- Adaptar o coletor a outras cidades com APIs parecidas com a Olho Vivo.
- Revisão de metodologia por pessoas de estatística e de transporte.

## Pull requests

Abra uma issue descrevendo o problema ou a ideia. No PR, explique o que mudou e rode os testes. Relatos de erro nos números são bem-vindos: inclua o dia, o horário e o trecho dos dados.
