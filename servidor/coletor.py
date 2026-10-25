#!/usr/bin/env python3
"""Coletor independente da API Olho Vivo (SPTrans).

Cada execução: autentica, baixa /Posicao (todos os ônibus monitorados), grava a
resposta original comprimida com hash SHA-256 encadeado (manifest.jsonl) e
atualiza o SQLite com os agregados usados pelo painel.
Só usa a biblioteca padrão. Token em SPTRANS_TOKEN (arquivo /etc/analise-onibus.env).
"""
import base64, gzip, hashlib, http.cookiejar, json, math, os, shutil, sqlite3, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

# Dois modos de autenticação, escolhidos em ONIBUS_MODO:
#   legado  : POST /Login/Autenticar?token=... com cookie (SPTRANS_TOKEN)
#   gateway : gateway APILIB da Prefeitura (WSO2), cabeçalho Authorization: Bearer.
#             Usa SPTRANS_ACCESS_TOKEN fixo, ou renova sozinho com
#             SPTRANS_CONSUMER_KEY + SPTRANS_CONSUMER_SECRET (client_credentials).
MODO = os.environ.get("ONIBUS_MODO", "legado")
GATEWAY = "https://gateway.apilib.prefeitura.sp.gov.br"
BASE = os.environ.get("OLHOVIVO_BASE", GATEWAY + "/sptrans/olhovivo/v2.1" if MODO == "gateway" else "http://api.olhovivo.sptrans.com.br/v2.1")
UA = "Mozilla/5.0 (X11; Linux x86_64) analise-onibus/1.0"  # o Cloudflare da SPTrans bloqueia Python-urllib
DATA = os.environ.get("ONIBUS_DATA", "/var/lib/analise-onibus")
FRESCO_S = 180          # posição considerada atual se atualizada há até 3 min
MOVIDO_M = 50           # deslocamento mínimo entre coletas para contar "em movimento"
BUCKET_S = 600          # janela de agregação: 10 min
MIN_LIVRE_GB = 5
SE = (-23.5505, -46.6333)  # Praça da Sé, referência das zonas


def zona(lat, lon):
    dy = (lat - SE[0]) * 111.0
    dx = (lon - SE[1]) * 111.0 * math.cos(math.radians(SE[0]))
    d = math.hypot(dx, dy)
    if d < 4:
        return "Centro"
    if abs(dx) >= abs(dy):
        setor = "Leste" if dx > 0 else "Oeste"
    else:
        setor = "Norte" if dy > 0 else "Sul"
    return f"{setor} {'periférica' if d > 10 else 'intermediária'}"


def metros(lat1, lon1, lat2, lon2):
    dy = (lat2 - lat1) * 111000.0
    dx = (lon2 - lon1) * 111000.0 * math.cos(math.radians(lat1))
    return math.hypot(dx, dy)


def token_gateway():
    fixo = os.environ.get("SPTRANS_ACCESS_TOKEN", "").strip()
    if fixo:
        return fixo
    ck, cs = os.environ.get("SPTRANS_CONSUMER_KEY", "").strip(), os.environ.get("SPTRANS_CONSUMER_SECRET", "").strip()
    if not (ck and cs):
        sys.exit("modo gateway sem SPTRANS_ACCESS_TOKEN nem SPTRANS_CONSUMER_KEY/SECRET")
    cache = os.path.join(DATA, "token_cache.json")
    try:
        c = json.load(open(cache))
        if c["expira"] > time.time() + 120:
            return c["token"]
    except Exception:
        pass
    req = urllib.request.Request(GATEWAY + "/token", data=urllib.parse.urlencode({"grant_type": "client_credentials"}).encode(), method="POST",
                                 headers={"Authorization": "Basic " + base64.b64encode(f"{ck}:{cs}".encode()).decode(), "User-Agent": UA})
    r = json.loads(urllib.request.urlopen(req, timeout=30).read())
    with open(cache, "w") as f:
        os.chmod(cache, 0o600)
        json.dump({"token": r["access_token"], "expira": time.time() + int(r.get("expires_in", 3600))}, f)
    return r["access_token"]


def baixar(token):
    if MODO == "gateway":
        req = urllib.request.Request(f"{BASE}/Posicao", headers={"Authorization": f"Bearer {token_gateway()}", "User-Agent": UA})
        return urllib.request.urlopen(req, timeout=60).read()
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [("User-Agent", UA)]
    r = op.open(urllib.request.Request(f"{BASE}/Login/Autenticar?token={token}", data=b"", method="POST"), timeout=30)
    if r.read().strip() != b"true":
        raise RuntimeError("token recusado pela SPTrans")
    return op.open(f"{BASE}/Posicao", timeout=60).read()


def db_abrir():
    db = sqlite3.connect(os.path.join(DATA, "db.sqlite"), timeout=60)
    db.executescript("""
    CREATE TABLE IF NOT EXISTS snap(ts INTEGER PRIMARY KEY, total INTEGER, frescos INTEGER, movidos INTEGER, linhas INTEGER, sha TEXT);
    CREATE TABLE IF NOT EXISTS pos(p INTEGER PRIMARY KEY, lat REAL, lon REAL, ts INTEGER);
    CREATE TABLE IF NOT EXISTS veic(bucket INTEGER, p INTEGER, cl INTEGER, c TEXT, zona TEXT, movido INTEGER, PRIMARY KEY(bucket,p));
    """)
    return db


def main():
    token = os.environ.get("SPTRANS_TOKEN", "").strip()
    if MODO == "legado" and not token:
        sys.exit("SPTRANS_TOKEN ausente")
    os.makedirs(os.path.join(DATA, "raw"), exist_ok=True)
    if shutil.disk_usage(DATA).free < MIN_LIVRE_GB * 2**30:
        sys.exit("disco quase cheio, coleta abortada")
    agora = int(time.time())
    for tentativa in range(3):  # o gateway devolve 500 de forma intermitente
        try:
            bruto = baixar(token)
            break
        except urllib.error.HTTPError as e:
            if e.code < 500 or tentativa == 2:
                raise
            time.sleep(4)
    sha = hashlib.sha256(bruto).hexdigest()
    dia = datetime.fromtimestamp(agora, timezone.utc).strftime("%Y-%m-%d")
    pasta = os.path.join(DATA, "raw", dia)
    os.makedirs(pasta, exist_ok=True)
    arq = os.path.join(pasta, f"{agora}.json.gz")
    with gzip.open(arq, "wb", 6) as f:
        f.write(bruto)
    man = os.path.join(DATA, "manifest.jsonl")
    prev = ""
    if os.path.exists(man):
        with open(man, "rb") as f:
            f.seek(max(0, os.path.getsize(man) - 4096))
            ult = f.read().splitlines()
            if ult:
                prev = json.loads(ult[-1]).get("encadeado", "")
    enc = hashlib.sha256((prev + sha).encode()).hexdigest()
    with open(man, "a") as f:
        f.write(json.dumps({"ts": agora, "arquivo": os.path.relpath(arq, DATA), "sha256": sha, "bytes": len(bruto), "encadeado": enc}) + "\n")

    dados = json.loads(bruto)
    db = db_abrir()
    antes = {p: (la, lo) for p, la, lo in db.execute("SELECT p,lat,lon FROM pos")}
    bucket = agora // BUCKET_S * BUCKET_S
    total = frescos = movidos = 0
    linhas = set()
    veic, pos = [], []
    for l in dados.get("l", []):
        for v in l.get("vs", []):
            total += 1
            try:
                ta = datetime.fromisoformat(v["ta"].replace("Z", "+00:00")).timestamp()
            except Exception:
                continue
            if agora - ta > FRESCO_S:
                continue
            frescos += 1
            lat, lon, p = v["py"], v["px"], v["p"]
            mov = int(p in antes and metros(*antes[p], lat, lon) >= MOVIDO_M)
            movidos += mov
            if mov:
                linhas.add(l.get("c", l["cl"]))  # letreiro, igual ao route_id do GTFS (cl é por sentido)
            veic.append((bucket, p, l["cl"], l.get("c", ""), zona(lat, lon), mov))
            pos.append((p, lat, lon, agora))
    db.executemany("INSERT INTO veic VALUES(?,?,?,?,?,?) ON CONFLICT(bucket,p) DO UPDATE SET movido=max(movido,excluded.movido), cl=excluded.cl, c=excluded.c, zona=excluded.zona", veic)
    db.executemany("INSERT INTO pos VALUES(?,?,?,?) ON CONFLICT(p) DO UPDATE SET lat=excluded.lat, lon=excluded.lon, ts=excluded.ts", pos)
    db.execute("INSERT OR REPLACE INTO snap VALUES(?,?,?,?,?,?)", (agora, total, frescos, movidos, len(linhas), sha))
    db.commit()
    print(f"{agora} total={total} frescos={frescos} movidos={movidos} linhas={len(linhas)}")


if __name__ == "__main__":
    main()
