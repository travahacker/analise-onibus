(async function () {
  const $ = (id) => document.getElementById(id);
  const tip = $("tip");
  const J = [8, 17];                       // janela de votação, hora local
  const EVENTOS = {"2026-10-04": "1º turno", "2026-10-25": "2º turno"};
  const METRICAS = {
    op: {txt: "Ônibus ligados a uma linha, com GPS atualizado nos últimos 3 minutos, ao mesmo tempo. Inclui os parados em ponto final e exclui garagem."},
    mv: {txt: "Ônibus operando que se deslocaram ao menos 50 m desde a coleta anterior. Parado em terminal ou semáforo não conta."},
    lin: {txt: "Letreiros de linha com ao menos um ônibus em movimento em 10 minutos. A linha tracejada mostra as linhas de dia útil programadas no GTFS."},
  };
  const fmt = (n) => (n == null ? "n/d" : Math.round(n).toLocaleString("pt-BR"));
  const dataBr = (k) => k.slice(8) + "/" + k.slice(5, 7);
  const hh = (h) => String(Math.floor(h)).padStart(2, "0") + "h" + String(Math.round((h % 1) * 60)).padStart(2, "0");
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

  // tema
  const root = document.documentElement;
  try { const t = localStorage.getItem("tema"); if (t) root.dataset.theme = t; } catch (e) {}
  $("tema").onclick = () => {
    const escuro = (root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
    root.dataset.theme = escuro ? "light" : "dark";
    try { localStorage.setItem("tema", root.dataset.theme); } catch (e) {}
  };

  // aparência: três layouts (painel, jornal, bloco), lembrados no navegador e aceitos por ?tema=
  (function aparencia() {
    const btn = $("ap-btn"), menu = $("ap-menu"), meta = document.querySelector('meta[name="theme-color"]');
    const cores = {painel: "#0e0e0d", jornal: "#f5f5ef", bloco: "#f1efe8"};
    const marca = () => {
      const atual = root.dataset.layout || "painel";
      menu.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b.dataset.layout === atual));
      if (meta) meta.setAttribute("content", cores[atual]);
    };
    const fecha = () => { menu.classList.remove("aberto"); btn.setAttribute("aria-expanded", "false"); };
    btn.onclick = (e) => { e.stopPropagation(); const a = menu.classList.toggle("aberto"); btn.setAttribute("aria-expanded", a); if (a) menu.querySelector('[aria-checked="true"]').focus(); };
    menu.querySelectorAll("button").forEach((b) => (b.onclick = () => {
      root.dataset.layout = b.dataset.layout;
      try { localStorage.setItem("layout", b.dataset.layout); } catch (e) {}
      try { const u = new URL(location.href); u.searchParams.set("tema", b.dataset.layout); history.replaceState(null, "", u); } catch (e) {}
      marca(); fecha(); btn.focus();
    }));
    document.addEventListener("click", (e) => { if (!e.target.closest(".aparencia")) fecha(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { fecha(); btn.focus(); } });
    marca();
  })();

  // dados
  const get = async (u) => { try { const r = await fetch(u + "?" + Date.now()); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const series0 = (await get("data/series.json")) || {dias: [], coletas: 0, ultima_coleta: null};
  const linhas = (await get("data/linhas.json")) || {};
  const gtfs = await get("data/gtfs_ref.json");
  const dias = series0.dias;

  // estado da coleta
  const u = series0.ultima_coleta, idade = u ? Date.now() / 1000 - u.ts : null;
  if (u && idade < 600) { $("dot").classList.remove("off"); $("eyebrow").textContent = "Coleta ao vivo, dados do GPS dos ônibus"; }
  $("estado").textContent = u
    ? `Nossa coleta: desde ${new Date(series0.primeira * 1000).toLocaleString("pt-BR", {...tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"})} · última às ${new Date(u.ts * 1000).toLocaleTimeString("pt-BR", {...tz, hour: "2-digit", minute: "2-digit"})}${idade >= 600 ? " (parada)" : ""}`
    : "Aguardando o primeiro registro da API Olho Vivo";

  // séries por dia (cada dia medido vira uma linha; cresce sozinho com novos dias)
  const med = (a) => { const v = a.filter((x) => x != null).sort((p, q) => p - q); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const rotulo = (d) => (EVENTOS[d.data] ? `${EVENTOS[d.data]} da eleição (${dataBr(d.data)})` : `${d.dow} ${dataBr(d.data)}`);
  const cores = ["var(--s-eleicao)", "var(--s-domingo)", "var(--s-util)", "var(--s-sabado)", "var(--s-turno1)"];
  const S = dias.slice().sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 5).map((d, i) => ({
    d, rot: rotulo(d), curto: EVENTOS[d.data] || `${d.dow} ${dataBr(d.data)}`, cor: cores[i],
    pts: d.serie.map((p) => ({h: p.h, op: p.op, mv: p.mv, lin: p.lin})).sort((a, b) => a.h - b.h),
  }));
  const eleicao = S.find((s) => EVENTOS[s.d.data]);
  const naJanela = (p) => p.h >= J[0] && p.h < J[1];
  const horasMedidas = (s) => new Set(s.pts.filter((p) => naJanela(p) && p.op != null).map((p) => k6(p.h))).size / 6;

  // conclusão e evidências
  (function conclusao() {
    const V = $("veredito"), C = $("placar-cards");
    const evDia = eleicao && eleicao.d;
    let nS = 0, nD = 0, totS = 0, totD = 0, h = 0;
    if (evDia && gtfs) {
      const ativo = linhas[evDia.data] || {}, U = gtfs.tipos.util.rotas, D = new Set(gtfs.tipos.domingo.rotas);
      const soUtil = U.filter((c) => !D.has(c));
      nS = soUtil.filter((c) => ativo[c] > 0).length; totS = soUtil.length;
      nD = [...D].filter((c) => ativo[c] > 0).length; totD = D.size; h = horasMedidas(eleicao);
    }
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    V.innerHTML = `<span class="tag">Conclusão de hoje</span>
      <h2>Os sinais convergem: circularam menos ônibus do que o nível de dia útil exigido pela Justiça.</h2>
      <p>A decisão pediu 100% da frota operacional e programação de dia útil. A Carta Circular da SPTrans prevê uma reserva técnica operacional mínima de 10%, prioritariamente em terminais e linhas periféricas, e o Instituto Pólis considera 85% o mínimo esperado de circulação. Quatro sinais, de origens diferentes, indicam que o nível exigido não foi atingido. Nenhum indica o contrário. O prefeito disse que a frota opera normalmente e acima da demanda, mas não divulgou número.</p>
      <p><b>Confiança: média a alta quanto à direção, média quanto ao tamanho.</b> Só o Cebrap compara diretamente com dias úteis, duas fontes não publicam seus dados e a SPTrans ainda não divulgou número oficial de hoje.</p>
      <p><b>O que não concluímos:</b> se isso configura descumprimento da ordem, que é decisão da Justiça, e se houve intenção de alguém.</p>`;
    const card = (t, big, small, meta, cor) => `<div class="card resp" style="--cor:${cor}"><h3>${t}</h3><div class="big">${big} <small>${small}</small></div><div class="meta">${meta}</div></div>`;
    C.innerHTML =
      card("Cebrap, 11h às 14h", "−31,4%", "ônibus ao mesmo tempo", `Em relação aos dias úteis da mesma semana, com a mesma API pública que usamos, coleta minuto a minuto. Fonte: ${lk(F.cebrap, "Metrópoles")}. Sem dados públicos.`, "var(--s-eleicao)") +
      card("BusInfo, 13h20 e 14h40", "71%", "da frota em circulação", `9.892 de 13.790 e 9.786 de 13.767. O Instituto Pólis considera o mínimo esperado 85%, idealmente 90%. Método do app não divulgado. Fontes: ${lk(F.b247, "Brasil 247")}, ${lk(F.abc, "ABC do ABC")}.`, "var(--s-domingo)") +
      card("Plano da própria Prefeitura", "6,9 mil", "ônibus, nível de sábado", `Anunciado para o 2º turno. Depois da ordem, a SPTrans disse que as operadoras tinham dificuldade de readequar escalas em menos de 12 horas, com mais de 10 mil trabalhadores a mobilizar. Fontes: ${lk(F.gazeta, "Gazeta SP")}, ${lk(F.dt, "Diário do Transporte")}.`, "var(--ink3)") +
      (evDia && gtfs ? card("Nossa coleta, a partir das 16h30", pct(nS, totS) + "%", "das linhas só de dia útil rodando", `${fmt(nS)} de ${fmt(totS)}, contra ${pct(nD, totD)}% das linhas de domingo no mesmo período (${String(h.toFixed(1)).replace(".", ",")} h medidas). Indício indireto: uma linha de intervalo longo pode não aparecer numa janela curta.`, "var(--s-util)") : "");
  })();

  // gráfico
  let metrica = "op";
  const W = 960, H = 340, M = {l: 52, r: 100, t: 16, b: 30};
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
    for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; }
    const passo = b - a <= 8 ? 1 : 3;
    for (let h = Math.ceil(a / passo) * passo; h <= b; h += passo) g += `<text x="${x(h)}" y="${H - 9}" text-anchor="middle">${h}h</text>`;
    refs.forEach((r) => { g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(r.v)}" y2="${y(r.v)}" stroke="var(--ink3)" stroke-width="1.5" stroke-dasharray="6 5"/><text x="${M.l + 8}" y="${y(r.v) - 6}">${r.label}</text>`; });
    const fins = [];
    S.forEach((s) => {
      let d = "", prev = null;
      s.pts.forEach((p) => { if (p[metrica] == null) { prev = null; return; } d += (prev == null || p.h - prev > 0.5 ? "M" : "L") + x(p.h).toFixed(1) + " " + y(p[metrica]).toFixed(1) + " "; prev = p.h; });
      const ult = [...s.pts].reverse().find((p) => p[metrica] != null);
      g += `<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
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
    const ini = eleicao && eleicao.pts.length ? hh(eleicao.pts[0].h) : null;
    $("leitura").textContent = ini && S.length === 1 ? `Nossa medição vai das ${ini} em diante. A manhã da votação não foi medida por nós.` : "";
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
  const ultOp = eleicao ? [...eleicao.pts].reverse().find((p) => p.op != null) : null;
  $("decl").innerHTML = `<tr><th>Fonte</th><th>O que diz</th><th>Como se compara com a nossa medição</th></tr>
    <tr><td>Justiça Eleitoral e Carta Circular da SPTrans (24/10), via ${lk(F.dt, "Diário do Transporte")}</td><td>100% da frota operacional; todas as linhas com "frota e programação de dias úteis"; reserva técnica operacional mínima de 10%, prioritariamente em terminais e linhas periféricas</td><td>Esse é o critério. Nossa coleta mostra parte das linhas de dia útil sem ônibus em movimento, mas não mede a frota total.</td></tr>
    <tr><td>Prefeitura e SPTrans (plano anunciado), via ${lk(F.gazeta, "Gazeta SP")}</td><td>Cerca de 6,9 mil ônibus e 1.137 linhas, nível de sábado</td><td>${ultOp ? "Nossa foto das " + hh(ultOp.h) + ": " + fmt(ultOp.op) + " ônibus ligados a uma linha, com GPS ativo." : "Sem medição."}</td></tr>
    <tr><td>Prefeito Nunes, via CNN</td><td>A frota opera normalmente e acima da demanda, sem divulgar número</td><td>Sem número para comparar.</td></tr>
    <tr><td>Cebrap, via ${lk(F.cebrap, "Metrópoles")}</td><td>11h às 14h: 31,4% menos ônibus ao mesmo tempo que em dias úteis. Quedas de 18,1% nas periferias e 10,6% nos bairros ricos</td><td>Mesma API que a nossa. Cobre a manhã, que não medimos. A reportagem não traz números absolutos nem a definição de periferia.</td></tr>
    <tr><td>BusInfo, via ${lk(F.carioca, "Diário Carioca")}, ${lk(F.b247, "Brasil 247")}</td><td>13h20: 9.892 de 13.790 (71,7%). 14h40: 9.786 de 13.767 (71%). Conta ônibus parados em terminal</td><td>Não comparável com os 6,9 mil da nossa foto: ele diz contar quem saiu da garagem, com método não divulgado.</td></tr>
    <tr><td>Instituto Pólis, via ${lk(F.abc, "ABC do ABC")}</td><td>A circulação deveria passar de 85%, idealmente 90%</td><td>Parâmetro para ler o 71% do BusInfo.</td></tr>
    <tr><td>Campanha de Lula</td><td>Cerca de 60% da frota</td><td>Não verificado. Não encontramos a fonte do número.</td></tr>`;

  // linhas programadas sem ônibus
  (function linhasSem() {
    const el = $("sem");
    if (!el) return;
    if (!gtfs || !eleicao) { el.textContent = "Aguardando dados."; return; }
    const d = eleicao.d, prog = gtfs.tipos.util.rotas, ativo = linhas[d.data] || {};
    const falta = prog.filter((c) => !(ativo[c] > 0)), ordem = new Set(gtfs.tipos.domingo.rotas);
    const soUtil = falta.filter((c) => !ordem.has(c));
    $("semn").textContent = `${fmt(falta.length)} de ${fmt(prog.length)} linhas de dia útil sem ônibus em movimento (${fmt(soUtil.length)} delas só existem em dia útil)`;
    $("semt").textContent = `Medido de 8h a 17h em ${horasMedidas(eleicao).toFixed(1).replace(".", ",")} h. Uma linha de intervalo longo pode ficar sem ônibus em movimento numa janela de 10 minutos, então o número tende a cair com mais horas medidas.`;
    el.textContent = falta.slice(0, 250).join(", ") + (falta.length > 250 ? ` … e mais ${falta.length - 250}` : "");
  })();
})();
