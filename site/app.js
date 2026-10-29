(async function () {
  const $ = (id) => document.getElementById(id);
  const tip = $("tip");
  const J = [8, 17];                       // janela de votação, hora local
  const EVENTOS = {"2026-10-04": "1º turno", "2026-10-25": "2º turno"};
  const FERIADOS = ["2026-11-02", "2026-11-20", "2026-12-25"];  // não entram como dia útil de referência
  const METRICAS = {
    op: {txt: "Ônibus ligados a uma linha, com GPS atualizado nos últimos 3 minutos, ao mesmo tempo. Inclui os parados em ponto final e exclui garagem."},
    mv: {txt: "Ônibus operando que se deslocaram ao menos 50 m desde a coleta anterior. Parado em terminal ou semáforo não conta."},
    lin: {txt: "Letreiros de linha com ao menos um ônibus em movimento em 10 minutos. A linha tracejada mostra as linhas de dia útil programadas no GTFS."},
  };
  const fmt = (n) => (n == null ? "n/d" : Math.round(n).toLocaleString("pt-BR"));
  const mil = (n) => (n / 1000).toLocaleString("pt-BR", {minimumFractionDigits: 1, maximumFractionDigits: 1}) + " mil";
  const pc = (r) => Math.round(r * 100);
  const dataBr = (k) => k.slice(8) + "/" + k.slice(5, 7);
  const hh = (h) => String(Math.floor(h)).padStart(2, "0") + "h" + String(Math.round((h % 1) * 60)).padStart(2, "0");
  const hfim = (h) => (h >= 24 ? "meia-noite" : hh(h));
  const k6 = (h) => Math.round(h * 6);     // índice da janela de 10 min
  const tz = {timeZone: "America/Sao_Paulo"};
  const lk = (u, t) => `<a href="${u}">${t}</a>`;
  const F = {
    cebrap: "https://www.metropoles.com/sao-paulo/periferias-onde-lula-venceu-sao-as-mais-afetadas-por-falta-de-onibus-em-sp",
    b247: "https://www.brasil247.com/sudeste/sao-paulo-tem-apenas-71-dos-onibus-em-circulacao-diz-levantamento/",
    abc: "https://www.abcdoabc.com.br/eleicoes-2026-frota-reduzida-de-onibus-em-sp/",
    carioca: "https://www.diariocarioca.com/2026/10/25/politica/eleicoes/boulos-pedira-prisao-de-ricardo-nunes-por-frota-reduzida-em-sp/",
    dt: "https://diariodotransporte.com.br/2026/10/25/sao-paulo-tem-reclamacoes-sobre-oferta-de-onibus-na-eleicao-prefeitura-diz-que-comunicou-ordem-de-frota-de-100-as-empresas/",
    gazeta: "https://www.gazetasp.com.br/cotidiano/sao-paulo-aumenta-frota-de-onibus-em-40-para-o-segundo-turno-das-eleicoes-e-tera-69-mil-veiculos-com-passagem-gratuita/",
  };

  // dados
  const get = async (u) => { try { const r = await fetch(u + "?" + Date.now()); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const series0 = (await get("data/series.json")) || {dias: [], coletas: 0, ultima_coleta: null};
  const cmp = await get("data/comparacao.json");
  const gtfs = await get("data/gtfs_ref.json");
  const dias = series0.dias;

  // estado da coleta
  const u = series0.ultima_coleta, idade = u ? Date.now() / 1000 - u.ts : null;
  if (u && idade < 600) { $("dot").classList.remove("off"); $("eyebrow").textContent = "Coleta ao vivo, dados do GPS dos ônibus"; }
  $("estado").textContent = u
    ? `Nossa coleta: desde ${new Date(series0.primeira * 1000).toLocaleString("pt-BR", {...tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"})} · última às ${new Date(u.ts * 1000).toLocaleTimeString("pt-BR", {...tz, hour: "2-digit", minute: "2-digit"})} de ${new Date(u.ts * 1000).toLocaleDateString("pt-BR", {...tz, day: "2-digit", month: "2-digit"})}${idade >= 600 ? " (parada)" : ""}`
    : "Aguardando o primeiro registro da API Olho Vivo";

  // séries: cada dia de evento é uma linha; dias úteis, domingos e sábados normais viram uma mediana (cor fixa por tipo de dia)
  const med = (a) => { const v = a.filter((x) => x != null).sort((p, q) => p - q); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const classe = (d) => (EVENTOS[d.data] ? "ev" : FERIADOS.includes(d.data) ? "feriado" : d.dow === "dom" ? "domingo" : d.dow === "sáb" ? "sabado" : "util");
  const completo = (d) => d.serie.length >= 0.95 * 144;
  function juntar(grupo, id, rot, curto, cor) {
    const hm = new Map(); grupo.forEach((d) => d.serie.forEach((p) => hm.set(k6(p.h), p.h)));
    const pts = [...hm.values()].sort((a, b) => a - b).map((h) => {
      const ps = grupo.map((d) => d.serie.find((p) => k6(p.h) === k6(h))).filter(Boolean);
      return {h, op: med(ps.map((p) => p.op)), mv: med(ps.map((p) => p.mv)), lin: med(ps.map((p) => p.lin))};
    });
    return {id, rot, curto, cor, n: grupo.length, pts, dias: grupo};
  }
  const S = [];
  dias.filter((d) => classe(d) === "ev").sort((a, b) => (a.data < b.data ? 1 : -1)).forEach((d) =>
    S.push(juntar([d], "ev" + d.data, `${EVENTOS[d.data]} da eleição (${dataBr(d.data)})`, `${EVENTOS[d.data]} ${dataBr(d.data)}`, EVENTOS[d.data] === "1º turno" ? "var(--s-turno1)" : "var(--s-eleicao)")));
  const tipos = [["util", "Dias úteis", "var(--s-util)"], ["domingo", "Domingo normal", "var(--s-domingo)"], ["sabado", "Sábado", "var(--s-sabado)"]];
  tipos.forEach(([c, nome, cor]) => {
    let g = dias.filter((d) => classe(d) === c); const cheios = g.filter(completo); if (cheios.length) g = cheios;
    if (g.length) S.push(juntar(g, c, g.length > 1 ? `${nome} (mediana de ${g.length} dias)` : `${nome} (${dataBr(g[0].data)})`, nome, cor));
  });
  const eleicao = S.find((s) => s.id.startsWith("ev"));

  // conclusão e evidências, atualizadas a partir de comparacao.json (calculada no servidor)
  (function conclusao() {
    const V = $("veredito"), C = $("placar-cards");
    const card = (t, big, small, meta, cor) => `<div class="card resp" style="--cor:${cor}"><h3>${t}</h3><div class="big">${big} <small>${small}</small></div><div class="meta">${meta}</div></div>`;
    const cardCebrap = card("Cebrap, 11h às 14h", "−31,4%", "ônibus ao mesmo tempo", `Em relação aos dias úteis da mesma semana, com a mesma API pública que usamos, coleta minuto a minuto. Fonte: ${lk(F.cebrap, "Metrópoles")}. Sem dados públicos.`, "var(--s-domingo)");
    const cardBus = card("BusInfo, 13h20 e 14h40", "71%", "da frota em circulação", `9.892 de 13.790 e 9.786 de 13.767. O Instituto Pólis considera o mínimo esperado 85%, idealmente 90%. Método do app não divulgado. Fontes: ${lk(F.b247, "Brasil 247")}, ${lk(F.abc, "ABC do ABC")}.`, "var(--ink3)");
    if (!cmp) {
      V.innerHTML = `<span class="tag">Resultado parcial</span><h2>Ainda não há dias úteis medidos para comparar com o dia da eleição.</h2>
        <p>Duas medições de terceiros, com métodos diferentes, apontam menos ônibus do que num dia útil: o Cebrap mediu 31,4% menos entre 11h e 14h, e o BusInfo, 71% da frota em circulação à tarde.</p>`;
      C.innerHTML = cardCebrap + cardBus; return;
    }
    const op = cmp.onibus_operando, mv = cmp.em_movimento, ln = cmp.linhas_ativas_por_janela, L = cmp.linhas;
    const menos = 100 - pc(op.razao), horas = cmp.janela.horas.toString().replace(".", ",");
    const faixa = `${hh(cmp.janela.inicio_h)} às ${hfim(cmp.janela.fim_h)}`;
    const rs = op.por_hora.map((x) => pc(x.razao)), uteis = cmp.uteis.map((k) => k.slice(8)).join(", ").replace(/, (\d+)$/, " e $1") + "/" + cmp.uteis[0].slice(5, 7);
    const atualizado = new Date(cmp.gerado * 1000).toLocaleDateString("pt-BR", {...tz, day: "2-digit", month: "2-digit", year: "numeric"});
    V.innerHTML = `<span class="tag">Conclusão · atualizada em ${atualizado}</span>
      <h2>No domingo da eleição circularam cerca de ${menos}% menos ônibus do que num dia útil, no período que medimos.</h2>
      <p>Medimos de ${faixa} em ${dataBr(cmp.evento)} e comparamos, janela de 10 minutos por janela, com os dias úteis da mesma semana (${uteis}), pelo mesmo método. Havia em média <b>${mil(op.evento)} ônibus operando contra ${mil(op.media_uteis)}</b>: ${pc(op.razao)}% do nível de dia útil, e em todas as horas entre ${Math.min(...rs)}% e ${Math.max(...rs)}%. A Justiça havia exigido programação de dia útil.</p>
      <p>A rede quase toda rodou: ${fmt(ln.evento)} linhas com ônibus em movimento por janela, contra ${fmt(ln.media_uteis)} nos dias úteis (${pc(ln.razao)}%). A diferença está em haver menos ônibus por linha, e não em linhas inteiras paradas.${L.ausentes_na_eleicao ? ` Ainda assim, ${L.ausentes_na_eleicao.quantidade} de ${fmt(L.ausentes_na_eleicao.de)} linhas que rodaram em todos os dias úteis não tiveram nenhum ônibus em movimento nessa faixa no domingo.` : ""}</p>
      <p>Duas medições de terceiros, com métodos diferentes e para outras horas, apontam diferença do mesmo tamanho: o Cebrap mediu 31,4% menos ônibus entre 11h e 14h, e o BusInfo, 71% da frota em circulação à tarde.</p>
      <p><b>Confiança: alta para a diferença na faixa medida</b> (mesmo método nos dois lados e ${cmp.uteis.length} dias úteis de referência), <b>média para o restante do dia</b>, que depende de medições de terceiros sem dados públicos. A SPTrans não divulgou número oficial.</p>
      <p><b>O que não concluímos:</b> se isso configura descumprimento da ordem, que é decisão da Justiça, e se houve intenção de alguém.</p>`;
    C.innerHTML =
      card(`Nossa medição, ${faixa}`, `−${menos}%`, "ônibus operando", `${fmt(op.evento)} contra ${fmt(op.media_uteis)} em média nos dias úteis (${uteis}). Mesma API e mesmo método, ${cmp.janela.janelas} janelas de 10 minutos. Ônibus em movimento: ${pc(mv.razao)}% do nível de dia útil.`, "var(--s-eleicao)") +
      cardCebrap + cardBus +
      (L.so_dia_util ? card("Linhas só de dia útil", `${L.so_dia_util.evento}`, `de ${L.so_dia_util.total} rodaram`, `Nos dias úteis, ${fmt(L.so_dia_util.media_uteis)} em média no mesmo horário. No total, ${fmt(ln.evento)} linhas ativas por janela contra ${fmt(ln.media_uteis)}.`, "var(--s-util)") : "");
  })();

  // gráfico
  let metrica = "op";
  const W = 960, H = 340, M = {l: 52, r: 110, t: 16, b: 30};
  const nice = (mx) => { const p = Math.pow(10, Math.floor(Math.log10(mx))), n = mx / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
  function grafico() {
    const svg = $("graf"), todos = S.flatMap((s) => s.pts.map((p) => p.h));
    let a = 0, b = 24;
    if (todos.length) { a = Math.max(0, Math.floor(Math.min(...todos)) - 1); b = Math.min(24, Math.ceil(Math.max(...todos)) + 1); if (b - a < 4) b = Math.min(24, a + 4); if (b - a >= 20) { a = 0; b = 24; } }
    const x = (h) => M.l + ((h - a) / (b - a)) * (W - M.l - M.r);
    const refs = metrica === "lin" && gtfs ? [{v: gtfs.tipos.util.linhas, label: `GTFS dia útil: ${fmt(gtfs.tipos.util.linhas)} linhas`}] : [];
    const vals = S.flatMap((s) => s.pts.map((p) => p[metrica])).filter((v) => v != null).concat(refs.map((r) => r.v));
    const max = nice(Math.max(...(vals.length ? vals : [100])) * 1.08), y = (v) => H - M.b - (v / max) * (H - M.t - M.b);
    let g = "";
    const x0 = Math.max(a, J[0]), x1 = Math.min(b, J[1]);
    if (x1 > x0) g += `<rect x="${x(x0)}" y="${M.t}" width="${x(x1) - x(x0)}" height="${H - M.t - M.b}" fill="var(--line)" opacity=".45" rx="6"/><text x="${(x(x0) + x(x1)) / 2}" y="${M.t + 14}" text-anchor="middle" style="font-weight:600">votação</text>`;
    if (cmp) { const c0 = Math.max(a, cmp.janela.inicio_h), c1 = Math.min(b, cmp.janela.fim_h); if (c1 > c0) g += `<rect x="${x(c0)}" y="${M.t}" width="${x(c1) - x(c0)}" height="${H - M.t - M.b}" fill="var(--s-eleicao)" opacity=".10" rx="6"/><text x="${(x(c0) + x(c1)) / 2}" y="${H - M.b - 8}" text-anchor="middle" style="font-weight:600">faixa comparada</text>`; }
    for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; }
    const passo = b - a <= 8 ? 1 : 3;
    for (let h = Math.ceil(a / passo) * passo; h <= b; h += passo) g += `<text x="${x(h)}" y="${H - 9}" text-anchor="middle">${h}h</text>`;
    refs.forEach((r) => { g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(r.v)}" y2="${y(r.v)}" stroke="var(--ink3)" stroke-width="1.5" stroke-dasharray="6 5"/><text x="${M.l + 8}" y="${y(r.v) - 6}">${r.label}</text>`; });
    const fins = [];
    // a eleição por último, para ficar por cima das outras linhas
    [...S].sort((p, q) => (p.id.startsWith("ev") ? 1 : 0) - (q.id.startsWith("ev") ? 1 : 0)).forEach((s) => {
      let d = "", prev = null;
      s.pts.forEach((p) => { if (p[metrica] == null) { prev = null; return; } d += (prev == null || p.h - prev > 0.5 ? "M" : "L") + x(p.h).toFixed(1) + " " + y(p[metrica]).toFixed(1) + " "; prev = p.h; });
      const ult = [...s.pts].reverse().find((p) => p[metrica] != null);
      g += `<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="${s.id.startsWith("ev") ? 3.5 : 2.2}" stroke-linecap="round" stroke-linejoin="round"/>`;
      if (ult) { g += `<circle cx="${x(ult.h)}" cy="${y(ult[metrica])}" r="5" fill="${s.cor}" stroke="var(--surface)" stroke-width="2"/>`; fins.push({s, py: y(ult[metrica]), px: x(ult.h)}); }
    });
    fins.sort((p, q) => p.py - q.py).forEach((f, i, arr) => { f.ly = i && f.py - arr[i - 1].ly < 14 ? arr[i - 1].ly + 14 : f.py; g += `<text x="${f.px + 10}" y="${f.ly + 4}" style="fill:var(--ink);font-weight:600">${f.s.curto}</text>`; });
    if (!S.length) g += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" style="font-size:14px">Aguardando a primeira coleta</text>`;
    g += `<line id="cx" y1="${M.t}" y2="${H - M.b}" stroke="var(--ink2)" opacity="0"/>`;
    svg.innerHTML = g;
    svg.onpointermove = (e) => {
      const r = svg.getBoundingClientRect(), h = a + (((e.clientX - r.left) / r.width) * W - M.l) / (W - M.l - M.r) * (b - a);
      if (h < a || h > b) return;
      const alvo = Math.floor(h * 6) / 6, linha = svg.querySelector("#cx");
      linha.setAttribute("x1", x(alvo)); linha.setAttribute("x2", x(alvo)); linha.setAttribute("opacity", 1);
      const rows = S.map((s) => { const p = s.pts.find((q) => k6(q.h) === k6(alvo)); return p && p[metrica] != null ? `<div><i style="display:inline-block;width:10px;height:4px;border-radius:2px;background:${s.cor};margin-right:6px"></i>${s.curto}: <b>${fmt(p[metrica])}</b></div>` : ""; }).join("");
      tip.innerHTML = `<b>${hh(alvo)}</b>${rows || "<div>sem medição</div>"}`; tip.style.display = "block";
      tip.style.left = Math.min(e.clientX + 14, innerWidth - 200) + "px"; tip.style.top = e.clientY + 14 + "px";
    };
    svg.onpointerleave = () => { tip.style.display = "none"; const l = svg.querySelector("#cx"); if (l) l.setAttribute("opacity", 0); };
    $("leg").innerHTML = S.map((s) => `<span><i style="background:${s.cor}"></i>${s.rot}</span>`).join("");
    $("explica").textContent = METRICAS[metrica].txt;
    const chave = metrica === "op" ? cmp && cmp.onibus_operando : metrica === "mv" ? cmp && cmp.em_movimento : cmp && cmp.linhas_ativas_por_janela;
    $("leitura").textContent = chave
      ? `Na faixa comparada (${hh(cmp.janela.inicio_h)} às ${hfim(cmp.janela.fim_h)}), o domingo da eleição ficou em ${pc(chave.razao)}% do nível dos dias úteis nesta medida. Antes dessa faixa só há dias úteis, porque nossa coleta começou às ${hh(cmp.janela.inicio_h)}.`
      : (eleicao && eleicao.pts.length ? `Nossa medição do dia da eleição vai das ${hh(eleicao.pts[0].h)} em diante.` : "");
    const hs = [...new Set(S.flatMap((s) => s.pts.map((p) => k6(p.h))))].sort((p, q) => p - q);
    $("tabela").innerHTML = `<tr><th>Horário</th>${S.map((s) => `<th class="n">${s.curto}</th>`).join("")}</tr>` +
      hs.map((k) => `<tr><td>${hh(k / 6)}</td>${S.map((s) => { const p = s.pts.find((q) => k6(q.h) === k); return `<td class="n">${p ? fmt(p[metrica]) : "n/d"}</td>`; }).join("")}</tr>`).join("");
  }
  document.querySelectorAll(".seg button").forEach((bt) => (bt.onclick = () => {
    metrica = bt.dataset.m;
    document.querySelectorAll(".seg button").forEach((x2) => x2.setAttribute("aria-pressed", x2 === bt));
    grafico();
  }));
  grafico();

  // o que foi dito e o que foi medido
  const nossa = cmp ? `Nossa medição, ${hh(cmp.janela.inicio_h)} às ${hfim(cmp.janela.fim_h)}: ${pc(cmp.onibus_operando.razao)}% do nível de dia útil em ônibus operando (${fmt(cmp.onibus_operando.evento)} contra ${fmt(cmp.onibus_operando.media_uteis)}).` : "Sem dias úteis medidos para comparar.";
  $("decl").innerHTML = `<tr><th>Fonte</th><th>O que diz</th><th>Como se compara com a nossa medição</th></tr>
    <tr><td>Justiça Eleitoral e Carta Circular da SPTrans (24/10), via ${lk(F.dt, "Diário do Transporte")}</td><td>100% da frota operacional; todas as linhas com "frota e programação de dias úteis"; reserva técnica operacional mínima de 10%, prioritariamente em terminais e linhas periféricas</td><td>Esse é o critério. ${nossa}</td></tr>
    <tr><td>Prefeitura e SPTrans (plano anunciado), via ${lk(F.gazeta, "Gazeta SP")}</td><td>Cerca de 6,9 mil ônibus e 1.137 linhas, nível de sábado</td><td>${cmp ? `Na faixa que medimos, a média foi de ${mil(cmp.onibus_operando.evento)} ônibus operando e ${fmt(cmp.linhas_ativas_por_janela.evento)} linhas ativas por janela.` : "Sem medição."}</td></tr>
    <tr><td>Prefeito Nunes, via CNN</td><td>A frota opera normalmente e acima da demanda, sem divulgar número</td><td>Sem número para comparar. A demanda não é medida aqui.</td></tr>
    <tr><td>Cebrap, via ${lk(F.cebrap, "Metrópoles")}</td><td>11h às 14h: 31,4% menos ônibus ao mesmo tempo que em dias úteis. Quedas de 18,1% nas periferias e 10,6% nos bairros ricos</td><td>Mesma API que a nossa, em outras horas (nós medimos a partir das 16h30). ${cmp ? `Nossa diferença (−${100 - pc(cmp.onibus_operando.razao)}%) é do mesmo tamanho.` : ""} A reportagem não traz números absolutos nem a definição de periferia.</td></tr>
    <tr><td>BusInfo, via ${lk(F.carioca, "Diário Carioca")}, ${lk(F.b247, "Brasil 247")}</td><td>13h20: 9.892 de 13.790 (71,7%). 14h40: 9.786 de 13.767 (71%). Conta ônibus parados em terminal</td><td>Método e horário diferentes dos nossos, então os números absolutos não são comparáveis. A direção é a mesma.</td></tr>
    <tr><td>Instituto Pólis, via ${lk(F.abc, "ABC do ABC")}</td><td>A circulação deveria passar de 85%, idealmente 90%</td><td>Parâmetro para ler o 71% do BusInfo.</td></tr>
    <tr><td>Campanha de Lula</td><td>Cerca de 60% da frota</td><td>Não verificado. Não encontramos a fonte do número.</td></tr>`;

  // linhas que rodaram em todos os dias úteis e não rodaram na eleição
  (function linhasSem() {
    const el = $("sem");
    if (!el) return;
    if (!cmp || !cmp.linhas.ausentes_na_eleicao) { el.textContent = "Aguardando dias úteis para comparar."; return; }
    const A = cmp.linhas.ausentes_na_eleicao;
    $("semn").textContent = `${fmt(A.quantidade)} de ${fmt(A.de)} linhas que rodaram em todos os dias úteis não tiveram ônibus em movimento no domingo da eleição (${hh(cmp.janela.inicio_h)} às ${hfim(cmp.janela.fim_h)})`;
    $("semt").textContent = `Comparação feita na mesma faixa horária, com ${cmp.uteis.length} dias úteis de referência. Uma linha de intervalo longo pode ficar sem ônibus em movimento num domingo mesmo estando em operação, então a lista mostra linhas com forte redução, não necessariamente suspensas.`;
    el.textContent = A.letreiros.slice(0, 300).join(", ") + (A.letreiros.length > 300 ? ` … e mais ${A.letreiros.length - 300}` : "");
  })();
})();
