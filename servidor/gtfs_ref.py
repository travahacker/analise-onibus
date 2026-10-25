#!/usr/bin/env python3
"""Extrai do GTFS oficial da SPTrans quais linhas têm serviço programado em cada tipo de dia.

Uso: gtfs_ref.py gtfs.zip saida.json
Só publica o conjunto de linhas (route_id) por tipo de dia. Não estima frota: 1.800 das
2.270 viagens têm service_id USD (todos os dias) e frequencies.txt não distingue o dia,
então intervalos de sábado e domingo saem iguais aos de dia útil e qualquer contagem de
ônibus derivada daí fica inflada (domingo ~10,7 mil contra ~4,9 mil informados).
"""
import csv, io, json, sys, zipfile


def main(zip_path, saida):
    z = zipfile.ZipFile(zip_path)
    rd = lambda n: list(csv.DictReader(io.TextIOWrapper(z.open(n), "utf-8-sig")))
    cal = {r["service_id"]: r for r in rd("calendar.txt")}
    trips = {r["trip_id"]: r for r in rd("trips.txt")}
    com_freq = {f["trip_id"] for f in rd("frequencies.txt")}
    out = {"fonte": "GTFS SPTrans", "calendario": [min(c["start_date"] for c in cal.values()), max(c["end_date"] for c in cal.values())], "tipos": {}}
    for tipo, col in {"util": "monday", "sabado": "saturday", "domingo": "sunday"}.items():
        rotas = sorted({t["route_id"] for i, t in trips.items() if i in com_freq and cal.get(t["service_id"], {}).get(col) == "1"})
        out["tipos"][tipo] = {"linhas": len(rotas), "rotas": rotas}
    with open(saida, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    for k, v in out["tipos"].items():
        print(k, v["linhas"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
