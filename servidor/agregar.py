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
EVENTO = os.environ.get("ONIBUS_EVENTO", "2026-10-25")  # dia a comparar com os dias úteis
UTEIS = {"seg", "ter", "qua", "qui", "sex"}
FERIADOS = {"2026-11-02", "2026-11-20", "2026-12-25"}  # não servem de dia útil de referência


def salvar(nome, obj):
    os.makedirs(OUT, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=OUT)
    with os.fdopen(fd, "w") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.chmod(tmp, 0o644)
    os.replace(tmp, os.path.join(OUT, nome))


def k6(h):
    return round(h * 6)  # índice da janela de 10 minutos


def media(valores):
    v = [x for x in valores if x is not None]
    return statistics.mean(v) if v else None


def comparacao(db, dias):
    """Compara o dia do evento com os dias úteis medidos, janela por janela, só nas horas em que o evento foi medido."""
    ev = dias.get(EVENTO)
    if not ev:
        return None
    pts = {k6(p["h"]): p for p in ev["serie"] if p.get("op") is not None}
    if len(pts) < 6:
        return None
    janela = sorted(pts)
    uteis = {}
    for k, dd in dias.items():
        if k == EVENTO or k in FERIADOS or dd["dow"] not in UTEIS:
            continue
        m = {k6(p["h"]): p for p in dd["serie"] if p.get("op") is not None}
        if sum(1 for b in janela if b in m) >= 0.95 * len(janela):  # o dia cobre a janela do evento
            uteis[k] = m
    if not uteis:
        return None

    def dia_media(m, campo, bs=None):
        return media([m[b].get(campo) for b in (bs or janela) if b in m])

    def bloco(campo, com_horas=False):
        e = dia_media(pts, campo)
        por_dia = {k: dia_media(m, campo) for k, m in uteis.items()}
        base = media(por_dia.values())
        out = {"evento": round(e), "media_uteis": round(base), "razao": round(e / base, 4), "por_dia": {k: round(v) for k, v in por_dia.items()}}
        if com_horas:
            horas = []
            for h in range(janela[0] // 6, janela[-1] // 6 + 1):
                bs = [b for b in janela if b // 6 == h]
                eh, uh = dia_media(pts, campo, bs), media([dia_media(m, campo, bs) for m in uteis.values()])
                if eh is not None and uh:
                    horas.append({"h": h, "evento": round(eh), "uteis": round(uh), "razao": round(eh / uh, 4)})
            out["por_hora"] = horas
        return out

    def letreiros(dia):
        base = int(datetime.strptime(dia, "%Y-%m-%d").replace(tzinfo=SP).timestamp())
        bs, achados = [base + b * 600 for b in janela], set()
        for i in range(0, len(bs), 400):
            parte = bs[i:i + 400]
            achados |= {r[0] for r in db.execute("SELECT DISTINCT c FROM veic WHERE movido=1 AND bucket IN (%s)" % ",".join("?" * len(parte)), parte)}
        return achados

    conj = {k: letreiros(k) for k in [EVENTO] + list(uteis)}

    def conta(universo=None):
        sel = (lambda s: s & universo) if universo is not None else (lambda s: s)
        por_dia = {k: len(sel(conj[k])) for k in uteis}
        return {"total": len(universo) if universo is not None else None, "evento": len(sel(conj[EVENTO])),
                "media_uteis": round(statistics.mean(por_dia.values()), 1), "por_dia": por_dia}

    linhas = {"em_movimento": conta()}
    gt = os.path.join(OUT, "gtfs_ref.json")
    if os.path.exists(gt):
        with open(gt) as f:
            g = json.load(f)["tipos"]
        U, D = set(g["util"]["rotas"]), set(g["domingo"]["rotas"])
        linhas.update({"so_dia_util": conta(U - D), "programadas_dia_util": conta(U), "programadas_domingo": conta(D)})
    sempre = set.intersection(*[conj[k] for k in uteis])
    ausentes = sorted(sempre - conj[EVENTO])
    linhas["ausentes_na_eleicao"] = {"quantidade": len(ausentes), "de": len(sempre), "letreiros": ausentes}
    b0, b1 = janela[0], janela[-1] + 1
    return {"gerado": int(datetime.now().timestamp()), "evento": EVENTO, "uteis": sorted(uteis),
            "janela": {"inicio_h": b0 / 6, "fim_h": b1 / 6, "janelas": len(janela), "horas": round(len(janela) / 6, 2)},
            "onibus_operando": bloco("op", True), "em_movimento": bloco("mv"), "linhas_ativas_por_janela": bloco("lin"),
            "linhas": linhas}


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
    comp = comparacao(db, dias)
    if comp:
        salvar("comparacao.json", comp)
    man =os.path.join(DATA, "manifest.jsonl")
    if os.path.exists(man):
        with open(man) as f:
            ls = f.read().splitlines()
        salvar("manifesto.json", {"total": len(ls), "ultimos": [json.loads(x) for x in ls[-50:]]})


if __name__ == "__main__":
    main()
