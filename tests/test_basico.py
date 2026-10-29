"""Testes básicos, só com a biblioteca padrão: python3 -m unittest discover -s tests -v"""
import gzip, hashlib, importlib.util, json, os, sqlite3, subprocess, sys, tempfile, threading, unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVIDOR = os.path.join(RAIZ, "servidor")
sys.path.insert(0, SERVIDOR)


def carregar(nome):
    spec = importlib.util.spec_from_file_location(nome, os.path.join(SERVIDOR, nome + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Geometria(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c = carregar("coletor")

    def test_zonas_por_distancia_e_direcao(self):
        se = (-23.5505, -46.6333)
        casos = {
            "Centro": (se[0] + 0.01, se[1]),                 # ~1 km
            "Norte intermediária": (se[0] + 7 / 111, se[1]),  # 7 km ao norte
            "Sul periférica": (se[0] - 15 / 111, se[1]),      # 15 km ao sul
            "Leste periférica": (se[0], se[1] + 0.118),       # ~12 km a leste
            "Oeste intermediária": (se[0], se[1] - 0.059),    # ~6 km a oeste
        }
        for esperado, (lat, lon) in casos.items():
            self.assertEqual(self.c.zona(lat, lon), esperado)

    def test_distancia_em_metros(self):
        self.assertAlmostEqual(self.c.metros(-23.55, -46.63, -23.549, -46.63), 111, delta=2)
        self.assertEqual(self.c.metros(-23.55, -46.63, -23.55, -46.63), 0)


class CadeiaDeHashes(unittest.TestCase):
    def montar(self, pasta, n=3):
        os.makedirs(os.path.join(pasta, "raw"))
        ant, linhas = "", []
        for i in range(n):
            bruto = json.dumps({"hr": "12:00", "l": [], "i": i}).encode()
            arq = os.path.join("raw", f"{1000 + i}.json.gz")
            with gzip.open(os.path.join(pasta, arq), "wb") as f:
                f.write(bruto)
            sha = hashlib.sha256(bruto).hexdigest()
            ant = hashlib.sha256((ant + sha).encode()).hexdigest()
            linhas.append(json.dumps({"ts": 1000 + i, "arquivo": arq, "sha256": sha, "bytes": len(bruto), "encadeado": ant}))
        with open(os.path.join(pasta, "manifest.jsonl"), "w") as f:
            f.write("\n".join(linhas) + "\n")

    def rodar(self, pasta):
        return subprocess.run([sys.executable, os.path.join(SERVIDOR, "verificar_manifesto.py"), pasta], capture_output=True, text=True)

    def test_cadeia_integra_passa_e_adulterada_falha(self):
        with tempfile.TemporaryDirectory() as d:
            self.montar(d)
            self.assertEqual(self.rodar(d).returncode, 0)
            with gzip.open(os.path.join(d, "raw", "1001.json.gz"), "wb") as f:  # adultera a coleta do meio
                f.write(b'{"hr": "12:00", "l": [], "i": 999}')
            r = self.rodar(d)
            self.assertEqual(r.returncode, 1)
            self.assertIn("CONTEÚDO ALTERADO", r.stdout)


class PontaAPonta(unittest.TestCase):
    """Coletor, agregação e verificador contra a API simulada."""

    def test_fluxo_completo(self):
        sim = carregar("api_simulada")
        srv = sim.servidor(0)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            with tempfile.TemporaryDirectory() as d:
                dados, saida = os.path.join(d, "dados"), os.path.join(d, "saida")
                os.makedirs(dados)
                env = dict(os.environ, ONIBUS_DATA=dados, ONIBUS_OUT=saida, ONIBUS_MODO="gateway",
                           SPTRANS_ACCESS_TOKEN=sim.TOKEN, OLHOVIVO_BASE=f"http://127.0.0.1:{srv.server_address[1]}")
                for i in range(2):
                    r = subprocess.run([sys.executable, os.path.join(SERVIDOR, "coletor.py")], env=env, capture_output=True, text=True)
                    self.assertEqual(r.returncode, 0, r.stderr)
                    if i == 0:
                        import time; time.sleep(1.1)  # coletas em segundos diferentes
                con = sqlite3.connect(os.path.join(dados, "db.sqlite"))
                snaps = con.execute("select total, frescos, movidos from snap order by ts").fetchall()
                con.close()
                self.assertEqual(len(snaps), 2)
                self.assertEqual(snaps[0][0], 200)       # 40 linhas x 5 ônibus
                self.assertEqual(snaps[0][2], 0)         # primeira coleta não tem posição anterior
                self.assertGreater(snaps[1][2], 0)       # na segunda, os ônibus andaram
                self.assertEqual(subprocess.run([sys.executable, os.path.join(SERVIDOR, "agregar.py")], env=env).returncode, 0)
                with open(os.path.join(saida, "series.json")) as f:
                    serie = json.load(f)
                self.assertEqual(serie["coletas"], 2)
                self.assertEqual(len(serie["dias"]), 1)
                r = subprocess.run([sys.executable, os.path.join(SERVIDOR, "verificar_manifesto.py"), dados], capture_output=True, text=True)
                self.assertEqual(r.returncode, 0, r.stdout)
        finally:
            srv.shutdown()
            srv.server_close()


class Comparacao(unittest.TestCase):
    """O evento é comparado com dias úteis, só nas horas em que o evento foi medido."""

    def test_razao_e_linhas_ausentes(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        sp = ZoneInfo("America/Sao_Paulo")
        agr = carregar("agregar")
        with tempfile.TemporaryDirectory() as d:
            agr.DATA, agr.OUT, agr.EVENTO = d, os.path.join(d, "out"), "2026-10-25"
            con = sqlite3.connect(os.path.join(d, "db.sqlite"))
            con.executescript("""
                CREATE TABLE snap(ts INTEGER PRIMARY KEY, total INTEGER, frescos INTEGER, movidos INTEGER, linhas INTEGER, sha TEXT);
                CREATE TABLE pos(p INTEGER PRIMARY KEY, lat REAL, lon REAL, ts INTEGER);
                CREATE TABLE veic(bucket INTEGER, p INTEGER, cl INTEGER, c TEXT, zona TEXT, movido INTEGER, PRIMARY KEY(bucket,p));""")
            # dia do evento (domingo): 2 linhas, 100 ônibus operando. Dias úteis (seg, ter): 3 linhas, 200 ônibus operando.
            casos = [("2026-10-25", ["A-10", "B-10"], 100), ("2026-10-26", ["A-10", "B-10", "C-10"], 200), ("2026-10-27", ["A-10", "B-10", "C-10"], 200)]
            for dia, linhas, operando in casos:
                meia_noite = int(datetime.strptime(dia, "%Y-%m-%d").replace(tzinfo=sp).timestamp())
                for k in range(102, 108):  # 17h00 às 17h50
                    b = meia_noite + k * 600
                    con.execute("INSERT INTO snap VALUES(?,?,?,?,?,?)", (b + 60, operando, operando, operando // 2, len(linhas), "x"))
                    for i, c in enumerate(linhas * 3):
                        con.execute("INSERT INTO veic VALUES(?,?,?,?,?,?)", (b, i, i, c, "Centro", 1))
            con.commit(); con.close()
            agr.main()
            with open(os.path.join(d, "out", "comparacao.json")) as f:
                c = json.load(f)
        self.assertEqual(c["uteis"], ["2026-10-26", "2026-10-27"])
        self.assertEqual(c["janela"]["janelas"], 6)
        self.assertEqual(c["onibus_operando"]["evento"], 100)
        self.assertEqual(c["onibus_operando"]["media_uteis"], 200)
        self.assertAlmostEqual(c["onibus_operando"]["razao"], 0.5)
        self.assertEqual(c["linhas"]["ausentes_na_eleicao"]["letreiros"], ["C-10"])
        self.assertEqual((c["linhas"]["ausentes_na_eleicao"]["quantidade"], c["linhas"]["ausentes_na_eleicao"]["de"]), (1, 3))

    def test_feriado_nao_vale_como_dia_util(self):
        agr = carregar("agregar")
        self.assertIn("2026-11-02", agr.FERIADOS)


if __name__ == "__main__":
    unittest.main()
