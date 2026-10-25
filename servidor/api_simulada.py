#!/usr/bin/env python3
"""API Olho Vivo simulada, só para desenvolvimento e testes (nenhum dado real).

Responde GET /Posicao no mesmo formato da API da SPTrans, com ônibus fictícios que
andam de forma aleatória a cada chamada, e exige o cabeçalho Authorization: Bearer.
Uso: api_simulada.py [PORTA]   (padrão 8787; token em TOKEN_SIMULADO, padrão "teste")
"""
import json, math, os, random, sys, time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

TOKEN = os.environ.get("TOKEN_SIMULADO", "teste")
N_LINHAS, POR_LINHA = int(os.environ.get("N_LINHAS", "40")), 5
random.seed(7)
ESTADO = [{"c": f"{1000 + n}-10", "cl": n, "v": [
    {"p": n * 100 + i, "lat": -23.55 + random.uniform(-.15, .15), "lon": -46.63 + random.uniform(-.2, .2), "ang": random.uniform(0, 6.28)}
    for i in range(POR_LINHA)]} for n in range(1, N_LINHAS + 1)]


def passo():
    """Move cada ônibus cerca de 90 m numa direção que muda de vez em quando."""
    for linha in ESTADO:
        for v in linha["v"]:
            v["lat"] += math.sin(v["ang"]) * 0.0008
            v["lon"] += math.cos(v["ang"]) * 0.0008
            if random.random() < .1:
                v["ang"] = random.uniform(0, 6.28)


def posicao():
    agora = datetime.now(timezone.utc)
    iso = agora.strftime("%Y-%m-%dT%H:%M:%SZ")
    passo()
    return {"hr": agora.strftime("%H:%M"), "l": [
        {"c": x["c"], "cl": x["cl"], "sl": 1, "lt0": "ORIGEM", "lt1": "DESTINO", "qv": len(x["v"]),
         "vs": [{"p": v["p"], "a": True, "ta": iso, "py": v["lat"], "px": v["lon"]} for v in x["v"]]}
        for x in ESTADO]}


class Manipulador(BaseHTTPRequestHandler):
    def responder(self, codigo, corpo):
        dados = json.dumps(corpo).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def do_GET(self):
        if not self.path.split("?")[0].endswith("/Posicao"):
            return self.responder(404, {"erro": "só /Posicao é simulado"})
        if self.headers.get("Authorization") != "Bearer " + TOKEN:
            return self.responder(401, {"erro": "token ausente ou inválido"})
        self.responder(200, posicao())

    def log_message(self, *a):
        pass


def servidor(porta=0):
    return HTTPServer(("127.0.0.1", porta), Manipulador)


if __name__ == "__main__":
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    print(f"API simulada em http://127.0.0.1:{porta}/ (token: {TOKEN})", flush=True)
    servidor(porta).serve_forever()
