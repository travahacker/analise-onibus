#!/usr/bin/env python3
"""Gera os JSON públicos do painel a partir do SQLite do coletor."""
import json, os, sqlite3, statistics, tempfile
from datetime import datetime
from zoneinfo import ZoneInfo

DATA = os.environ.get("ONIBUS_DATA", "/var/lib/analise-onibus")
OUT = os.environ.get("ONIBUS_OUT", "/var/www/travahacker/analise-onibus/data")
SP = ZoneInfo("America/Sao_Paulo")
JANELA = (8, 17)  # horário de votação, hora local
DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


def salvar(nome, obj):
    os.makedirs(OUT, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=OUT)
    with os.fdopen(fd, "w") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.chmod(tmp, 0o644)
    os.replace(tmp, os.path.join(OUT, nome))


def main():
    db = sqlite3.connect(os.path.join(DATA, "db.sqlite"), timeout=60)
    dias = {}
    for b, mov, fres, lin in db.execute(
        "SELECT bucket, sum(movido), count(*), count(DISTINCT CASE WHEN movido THEN c END) FROM veic GROUP BY bucket ORDER BY bucket"
    ):
        d = datetime.fromtimestamp(b, SP)
        k = d.strftime("%Y-%m-%d")
        dias.setdefault(k, {"data": k, "dow": DIAS[d.weekday()], "serie": []})["serie"].append(
            {"h": d.hour + d.minute / 60, "mov": mov, "fres": fres, "lin": lin, "z": {}})
    # instantâneos por coleta: operando = ônibus com posição atual; em movimento só vale com intervalo de 90 s a 10 min da coleta anterior
    inst, ant = {}, None
    for ts, fres, mov in db.execute("SELECT ts, frescos, movidos FROM snap ORDER BY ts"):
        d = datetime.fromtimestamp(ts // 600 * 600, SP)
        e = inst.setdefault((d.strftime("%Y-%m-%d"), d.hour + d.minute / 60), {"op": [], "mv": []})
        e["op"].append(fres)
        if ant is not None and 90 <= ts - ant <= 600:
            e["mv"].append(mov)
        ant = ts
    for k, dd in dias.items():
        for pt in dd["serie"]:
            e = inst.get((k, pt["h"]), {"op": [], "mv": []})
            pt["op"] = round(statistics.mean(e["op"])) if e["op"] else None
            pt["mv"] = round(statistics.mean(e["mv"])) if e["mv"] else None
    zonas = {}
    for b, z, mov in db.execute("SELECT bucket, zona, sum(movido) FROM veic GROUP BY bucket, zona"):
        d = datetime.fromtimestamp(b, SP)
        zonas[(d.strftime("%Y-%m-%d"), d.hour + d.minute / 60, z)] = mov
    for k, dd in dias.items():
        for pt in dd["serie"]:
            pt["z"] = {z: m for (kk, h, z), m in zonas.items() if kk == k and h == pt["h"]}
    linhas = {}
    for b, c, cl, n in db.execute("SELECT bucket, c, cl, sum(movido) FROM veic GROUP BY bucket, cl"):
        d = datetime.fromtimestamp(b, SP)
        if JANELA[0] <= d.hour < JANELA[1]:
            linhas.setdefault(d.strftime("%Y-%m-%d"), {}).setdefault(c, []).append(n)
    lin_out = {k: {c: round(statistics.mean(v), 2) for c, v in m.items()} for k, m in linhas.items()}
    snaps = db.execute("SELECT count(*), min(ts), max(ts) FROM snap").fetchone()
    ult = db.execute("SELECT ts,total,frescos,movidos,linhas FROM snap ORDER BY ts DESC LIMIT 1").fetchone()
    salvar("series.json", {"gerado": int(datetime.now().timestamp()), "dias": list(dias.values()), "janela": JANELA,
                           "coletas": snaps[0], "primeira": snaps[1], "ultima": snaps[2],
                           "ultima_coleta": dict(zip(["ts", "total", "frescos", "movidos", "linhas"], ult)) if ult else None})
    salvar("linhas.json", lin_out)
    man = os.path.join(DATA, "manifest.jsonl")
    if os.path.exists(man):
        with open(man) as f:
            ls = f.read().splitlines()
        salvar("manifesto.json", {"total": len(ls), "ultimos": [json.loads(x) for x in ls[-50:]]})


if __name__ == "__main__":
    main()
