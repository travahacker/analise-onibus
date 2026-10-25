#!/usr/bin/env python3
"""Confere a cadeia de hashes das coletas brutas.

Uso: verificar_manifesto.py PASTA_DE_DADOS
A pasta deve conter manifest.jsonl e raw/. Para cada registro, recalcula o SHA-256 da
resposta original (descomprimida), confere com o manifesto e refaz o hash encadeado
sha256(anterior + sha). Qualquer alteração em uma coleta antiga quebra a cadeia dali em diante.
"""
import gzip, hashlib, json, os, sys


def main(pasta):
    ant, n, erros = "", 0, 0
    with open(os.path.join(pasta, "manifest.jsonl")) as f:
        for linha in f:
            r = json.loads(linha)
            arq = os.path.join(pasta, r["arquivo"])
            try:
                bruto = gzip.open(arq, "rb").read()
            except OSError as e:
                print("ARQUIVO AUSENTE OU ILEGÍVEL:", r["arquivo"], e); erros += 1; ant = r["encadeado"]; continue
            sha = hashlib.sha256(bruto).hexdigest()
            enc = hashlib.sha256((ant + sha).encode()).hexdigest()
            if sha != r["sha256"]:
                print("CONTEÚDO ALTERADO:", r["arquivo"]); erros += 1
            if enc != r["encadeado"]:
                print("CADEIA QUEBRADA em", r["arquivo"]); erros += 1
            ant = r["encadeado"]; n += 1
    print(f"{n} registros conferidos, {erros} problema(s)")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main(sys.argv[1])
