// ===================== CRM FAG Escolas =====================
import { getApi } from "./api.js";
import { $, $$, esc, r2, brl, fmtDate, fmtKey, newKey, toast, modal, ST, chip, VERBAS, FORMAS, MESES, compLabel, today, onlyDig } from "./util.js";
import { Board, kanban, battery } from "./board.js";
import { abrirImportador } from "./importador.js";

const S = { api: null, me: null, cfg: null, escolas: [], esc: {}, team: [], page: "painel", cache: {} };
const isMaster = () => S.me?.papel === "master";
const perm = m => S.me?.permissoes?.[m] || ((S.me?.modulos || []).includes(m) ? "editar" : null);
const tem = m => isMaster() || ["ver", "editar"].includes(perm(m));      // pode ver
const edita = m => isMaster() || perm(m) === "editar";                   // pode alterar
const PAPEIS = { master: "Gestor geral", lider: "Líder", assistente: "Assistente", colaborador: "Colaborador", gestor: "Líder" };
const pinOk = p => /^\d{6}$/.test(p);
const DICT_FORMA = Object.fromEntries(FORMAS.map((f, i) => [f, { label: f, color: ["#3560b5","#63b231","#f46e16","#7f5347"][i] }]));
const PORTAL = () => location.href.replace(/crm\.html.*$/, "index.html").replace(/#.*$/, "");
const linkEscola = k => `${PORTAL()}?k=${fmtKey(k)}`;

/* =============== LOGIN =============== */
function showForm(id){ ["fLogin","fSignup","fReset","fNewPin","fWait"].forEach(f => $("#" + f).classList.toggle("hidden", f !== id)); }
$$(".goLogin").forEach(a => a.onclick = e => { e.preventDefault(); showForm("fLogin"); });
$("#goSignup").onclick = e => { e.preventDefault(); showForm("fSignup"); };
$("#goReset").onclick = e => { e.preventDefault(); $("#rEmail").value = $("#lEmail").value; showForm("fReset"); };
$$(".pin").forEach(i => i.addEventListener("input", () => i.value = i.value.replace(/\D/g, "").slice(0, 6)));
$("#lPin").addEventListener("keydown", e => { if (e.key === "Enter") $("#btLogin").click(); });
$("#btLogin").onclick = async () => {
  $("#lErr").textContent = ""; const em = $("#lEmail").value, pin = $("#lPin").value;
  if (!pinOk(pin)) return $("#lErr").textContent = "O PIN tem 6 números.";
  try { await S.api.auth.login(em, pin); } catch (e){ $("#lErr").textContent = /confirm/i.test(e.message) ? "Confirme seu e-mail antes de entrar (veja a caixa de entrada)." : "E-mail ou PIN incorretos."; }
};
$("#btSignup").onclick = async () => {
  const nome = $("#sNome").value.trim(), em = $("#sEmail").value.trim().toLowerCase(), p = $("#sPin").value;
  $("#sErr").textContent = "";
  if (nome.length < 3) return $("#sErr").textContent = "Informe seu nome.";
  if (!em.endsWith("@fagcontabilidade.com.br")) return $("#sErr").textContent = "Use seu e-mail @fagcontabilidade.com.br.";
  if (!pinOk(p)) return $("#sErr").textContent = "O PIN precisa ter 6 números.";
  if (p !== $("#sPin2").value) return $("#sErr").textContent = "Os PINs não conferem.";
  try { await S.api.auth.signup(nome, em, p); showForm("fLogin"); $("#lEmail").value = em;
    $("#lErr").innerHTML = `<span style="color:var(--ok)">Acesso criado! ${S.api.demo ? "" : "Confirme pelo link enviado ao seu e-mail e "}aguarde o gestor liberar.</span>`; }
  catch (e){ $("#sErr").textContent = e.message.includes("@fagcontabilidade") ? e.message : "Não foi possível criar: " + e.message; }
};
$("#btReset").onclick = async () => {
  const em = $("#rEmail").value.trim(); if (!em.endsWith("@fagcontabilidade.com.br")) return $("#rErr").textContent = "Use seu e-mail @fagcontabilidade.com.br.";
  try { await S.api.auth.resetPin(em); $("#rErr").innerHTML = `<span style="color:var(--ok)">Pronto! Se o e-mail estiver cadastrado, o link chega em instantes.</span>`; }
  catch (e){ $("#rErr").textContent = e.message; }
};
$("#btNewPin").onclick = async () => {
  const p = $("#nPin").value; if (!pinOk(p)) return $("#nErr").textContent = "O PIN precisa ter 6 números.";
  if (p !== $("#nPin2").value) return $("#nErr").textContent = "Os PINs não conferem.";
  try { await S.api.auth.setPin(p); history.replaceState(null, "", location.pathname); toast("PIN alterado!"); location.reload(); } catch (e){ $("#nErr").textContent = e.message; }
};
$("#btWaitOut").onclick = () => S.api.auth.logout();

/* =============== INICIALIZAÇÃO =============== */
(async () => {
  S.api = await getApi();
  if (S.api.demo){ $("#demoTag").classList.remove("hidden"); S.api.seedDemo(); }
  let recovery = /type=recovery|novo-pin/.test(location.hash);
  S.api.auth.onChange(async (perfil, ev) => {
    if (ev === "PASSWORD_RECOVERY" || (recovery && perfil)){ recovery = false; $("#vApp").classList.add("hidden"); $("#vLogin").classList.remove("hidden"); return showForm("fNewPin"); }
    if (!perfil){ S.me = null; $("#vApp").classList.add("hidden"); $("#vLogin").classList.remove("hidden"); return showForm("fLogin"); }
    if (!perfil.ativo){ $("#vApp").classList.add("hidden"); $("#vLogin").classList.remove("hidden"); return showForm("fWait"); }
    S.me = perfil; $("#vLogin").classList.add("hidden"); $("#vApp").classList.remove("hidden");
    await boot();
  });
})();

async function boot(){
  const [cfg, escolas, perfis] = await Promise.all([S.api.select("config", { eq: { chave: "campanha" } }), S.api.select("escolas", { order: ["nome"] }), S.api.select("perfis").catch(() => [])]);
  S.cfg = cfg[0]?.valor || { ano: 2027, valorGuia: 6, vigencia: "", aberto: true };
  setEscolas(escolas);
  S.perfis = perfis;
  const names = new Set(perfis.filter(p => p.ativo).map(p => p.nome));
  escolas.forEach(e => (e.responsaveis || []).forEach(n => names.add(n)));
  S.team = [...names].filter(Boolean).sort();
  renderNav(); window.onhashchange = route; route();
}
function setEscolas(list){ S.escolas = list; S.esc = Object.fromEntries(list.map(e => [e.id, e])); }
const escNome = id => S.esc[id]?.nome || (id ? "?" : "—");

/* =============== NAVEGAÇÃO =============== */
const PAGES = [
  ["painel", "Painel", "#ef3a20", "◎", null],
  ["escolas", "Escolas", "#3560b5", "▦", "escolas"],
  ["renovacao", "Renovação", "#fabb17", "↻", "contratos"],
  ["mensalidades", "Mensalidades", "#63b231", "$", "mensalidades"],
  ["prestacoes", "Prestações", "#f46e16", "✓", "prestacoes"],
  ["contabil", "Contábil", "#66c8f0", "Σ", "contabil"],
  ["atas", "ATA Bienal", "#9d50dd", "✎", "atas"],
  ["tarefas", "Tarefas e solicitações", "#ef3a20", "☰", "tarefas"],
  ["equipe", "Equipe", "#22305e", "☺", "_master"],
  ["config", "Configurações", "#7f5347", "⚙", "_master"],
];
const pode = m => m === null || (m === "_master" ? isMaster() : tem(m));
function renderNav(){
  $("#nav").innerHTML = PAGES.filter(p => pode(p[4])).map(([k, l, c, ic]) => `<a href="#/${k}" data-p="${k}"><span class="ic" style="background:${c}">${ic}</span>${l}<span class="badge hidden" id="bdg-${k}"></span></a>`).join("");
  $("#me").innerHTML = `<b>${esc(S.me.nome)}</b><div class="muted small">${PAPEIS[S.me.papel] || S.me.papel}${S.api.demo ? " · demonstração" : ""}</div>
    <div style="display:flex;gap:6px;margin-top:8px"><button class="btn sm sec" id="btPin">Trocar PIN</button><button class="btn sm sec" id="btOut">Sair</button></div>`;
  $("#btOut").onclick = () => S.api.auth.logout();
  $("#btPin").onclick = trocarPin;
  atualizarBadges();
}
async function atualizarBadges(){
  if (!tem("tarefas")) return;
  const t = await S.api.select("tarefas", { eq: { origem: "escola", status: "a_fazer" } }).catch(() => []);
  const b = $("#bdg-tarefas"); if (b){ b.textContent = t.length; b.classList.toggle("hidden", !t.length); }
}
function route(){
  const p = (location.hash.match(/^#\/(\w+)/) || [])[1] || "painel";
  const def = PAGES.find(x => x[0] === p);
  S.page = def && pode(def[4]) ? p : "painel";
  $$("#nav a").forEach(a => a.classList.toggle("on", a.dataset.p === S.page));
  $("#side").classList.remove("open");
  const c = $("#content"); c.innerHTML = `<div class="muted">Carregando…</div>`;
  ({ painel: pgPainel, escolas: pgEscolas, renovacao: pgRenovacao, mensalidades: pgMensalidades, prestacoes: pgPrestacoes,
     contabil: pgContabil, atas: pgAtas, tarefas: pgTarefas, equipe: pgEquipe, config: pgConfig })[S.page](c)
    .catch(e => { console.error(e); c.innerHTML = `<div class="notice bad">Erro ao carregar: ${esc(e.message)}</div>`; });
}
const header = (titulo, extra = "") => `<div class="pg-h"><button class="btn sec sm mtoggle" onclick="document.getElementById('side').classList.toggle('open')">☰</button><h1>${titulo}</h1><div class="sp"></div>${extra}</div>`;
const anoSel = (id, anos, sel) => `<select class="in" id="${id}" style="width:auto">${[...new Set(anos)].sort().reverse().map(a => `<option ${a == sel ? "selected" : ""}>${a}</option>`).join("")}</select>`;
const thisYear = () => new Date().getFullYear();
async function audit(acao, tabela, registro, detalhe){ try { await S.api.insert("auditoria", { acao, tabela, registro, detalhe, quem: S.me.id }); } catch {} }

async function trocarPin(){
  const m = modal(`<h2>Trocar PIN</h2><div class="grid2"><div class="field"><label class="f">Novo PIN</label><input class="in pin" id="p1" type="password" inputmode="numeric" maxlength="6"></div>
    <div class="field"><label class="f">Repita</label><input class="in pin" id="p2" type="password" inputmode="numeric" maxlength="6"></div></div>
    <div style="display:flex;gap:8px"><button class="btn" id="ok">Salvar</button><button class="btn sec" id="cx">Cancelar</button></div><div class="err" id="er"></div>`);
  m.q("#cx").onclick = m.close;
  m.q("#ok").onclick = async () => { const a = m.q("#p1").value, b = m.q("#p2").value;
    if (!pinOk(a)) return m.q("#er").textContent = "O PIN tem 6 números."; if (a !== b) return m.q("#er").textContent = "Os PINs não conferem.";
    try { await S.api.auth.setPin(a); m.close(); toast("PIN alterado"); } catch (e){ m.q("#er").textContent = e.message; } };
}

/* =============== PAINEL =============== */
async function pgPainel(c){
  const hoje = today(), mesAtual = hoje.slice(0, 7) + "-01", ano = +hoje.slice(0, 4);
  const [mens, prest, tar, contr] = await Promise.all([
    tem("mensalidades") ? S.api.select("mensalidades", { gte: { competencia: `${ano - 1}-01-01` } }) : [],
    tem("prestacoes") ? S.api.select("prestacoes", { eq: { ano } }) : [],
    tem("tarefas") ? S.api.select("tarefas") : [],
    tem("contratos") ? S.api.select("contratos", { eq: { ano: S.cfg.ano } }) : [],
  ]);
  const ativas = S.escolas.filter(e => e.situacao === "ativa");
  const doMes = mens.filter(m => m.competencia === mesAtual);
  const fimMes = new Date(+hoje.slice(0, 4), +hoje.slice(5, 7), 1).toISOString().slice(0, 10);
  const baixas = mens.filter(m => m.status === "pago" && m.data && m.data >= mesAtual && m.data < fimMes);
  const recebido = baixas.reduce((a, m) => a + (+m.valor || 0) + (+m.cartorio || 0), 0);
  const previsto = doMes.reduce((a, m) => a + (+m.valor || 0), 0);
  const atraso = mens.filter(m => (m.status === "em_atraso" || m.status === "cobrado" || (m.status === "a_receber" && m.competencia < mesAtual)));
  const atrasoTot = atraso.reduce((a, m) => a + (+m.valor || 0), 0);
  const porEscola = {}; atraso.forEach(m => { porEscola[m.escola_id] ??= { v: 0, n: 0 }; porEscola[m.escola_id].v += +m.valor || 0; porEscola[m.escola_id].n++; });
  const abertas = tar.filter(t => t.status !== "concluida");
  const vencidas = abertas.filter(t => t.prazo && t.prazo < hoje);
  const novasSol = tar.filter(t => t.origem === "escola" && t.status === "a_fazer");
  const problemas = prest.filter(p => ["Parado","Com erro"].includes(p.status));
  const lim = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const proc = ativas.filter(e => e.procuracao_validade && e.procuracao_validade <= lim).sort((a, b) => a.procuracao_validade.localeCompare(b.procuracao_validade));
  const resp = contr.filter(x => x.proposta_status !== "pendente").length, apr = contr.filter(x => x.proposta_status === "aprovada").length;
  const k = (l, v, s, href) => `<div class="kpi ${href ? "click" : ""}" ${href ? `onclick="location.hash='${href}'"` : ""}><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  c.innerHTML = header(`Olá, ${esc(S.me.nome.split(" ")[0])}!`, `<span class="muted small">${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</span>`) + `
    <div class="kpis">
      ${k("Escolas ativas", ativas.length, `Grupo A ${ativas.filter(e => e.grupo === "A").length} · Grupo B ${ativas.filter(e => e.grupo === "B").length}`, "#/escolas")}
      ${tem("mensalidades") ? k(`Recebido em ${compLabel(mesAtual).split("/")[0].toLowerCase()}`, brl(recebido), `${baixas.length} baixa(s) com data no mês · competência do mês prevista: ${brl(previsto)}`, "#/mensalidades") : ""}
      ${tem("mensalidades") ? k("Em atraso", brl(atrasoTot), `${atraso.length} mensalidade(s) · ${Object.keys(porEscola).length} escola(s)`, "#/mensalidades") : ""}
      ${tem("tarefas") ? k("Tarefas abertas", abertas.length, `${vencidas.length} com prazo vencido · ${novasSol.length} solicitação(ões) nova(s)`, "#/tarefas") : ""}
      ${tem("prestacoes") ? k(`PTRF ${ano} com problema`, problemas.filter(p => p.programa === "PTRF").length, "Parado ou com erro", "#/prestacoes") : ""}
      ${tem("prestacoes") ? k(`PDDE ${ano} com problema`, problemas.filter(p => p.programa === "PDDE").length, `Parado ou com erro · Básico ${problemas.filter(p => p.programa === "PDDE" && p.referencia === "Básico").length} · Estrutura ${problemas.filter(p => p.programa === "PDDE" && p.referencia === "Estrutura").length} · Qualidade ${problemas.filter(p => p.programa === "PDDE" && p.referencia === "Qualidade").length}`, "#/prestacoes") : ""}
      ${tem("contratos") ? k(`Renovação ${S.cfg.ano}`, `${resp}/${contr.length}`, `responderam · ${apr} aprovada(s)`, "#/renovacao") : ""}
    </div>
    <div class="cols2">
      ${tem("mensalidades") ? `<div class="card"><h3>Maiores atrasos</h3><ul class="list">${Object.entries(porEscola).sort((a, b) => b[1].v - a[1].v).slice(0, 8)
          .map(([id, x]) => `<li><a href="#" data-esc="${id}">${esc(escNome(id))}</a><span>${x.n}× · <b>${brl(x.v)}</b></span></li>`).join("") || "<li class='muted'>Nenhum atraso 🎉</li>"}</ul></div>` : ""}
      ${tem("tarefas") ? `<div class="card"><h3>Solicitações das escolas</h3><ul class="list">${novasSol.slice(0, 8).map(t => `<li><span><a href="#" data-tar="${t.id}">${esc(t.titulo)}</a><div class="small muted">${esc(escNome(t.escola_id))}</div></span><span class="small muted">${fmtDate(t.criado_em)}</span></li>`).join("") || "<li class='muted'>Nenhuma solicitação nova.</li>"}</ul></div>` : ""}
      ${tem("tarefas") ? `<div class="card"><h3>Prazos vencidos</h3><ul class="list">${vencidas.sort((a, b) => a.prazo.localeCompare(b.prazo)).slice(0, 8).map(t => `<li><span><a href="#" data-tar="${t.id}">${esc(t.titulo)}</a><div class="small muted">${esc(escNome(t.escola_id))} · ${(t.responsaveis || []).join(", ")}</div></span><span class="small" style="color:var(--bad)">${fmtDate(t.prazo)}</span></li>`).join("") || "<li class='muted'>Nada vencido.</li>"}</ul></div>` : ""}
      <div class="card"><h3>Procurações vencendo (90 dias)</h3><ul class="list">${proc.slice(0, 8).map(e => `<li><a href="#" data-esc="${e.id}">${esc(e.nome)}</a><span class="small ${e.procuracao_validade < hoje ? "" : "muted"}" style="${e.procuracao_validade < hoje ? "color:var(--bad)" : ""}">${fmtDate(e.procuracao_validade)}</span></li>`).join("") || "<li class='muted'>Nenhuma nos próximos 90 dias.</li>"}</ul></div>
    </div>`;
  $$("[data-esc]", c).forEach(a => a.onclick = e => { e.preventDefault(); fichaEscola(a.dataset.esc); });
  $$("[data-tar]", c).forEach(a => a.onclick = e => { e.preventDefault(); abrirTarefa(tar.find(t => t.id === a.dataset.tar)); });
}

/* =============== ESCOLAS =============== */
async function pgEscolas(c){
  const E = edita("escolas");
  // login do SIG (só gestor geral); a senha só aparece ao clicar e fica registrada
  const acc = tem("acessos") ? Object.fromEntries((await S.api.select("escolas_acessos", { cols: "escola_id,sig_login" }).catch(() => [])).map(a => [a.escola_id, a])) : {};
  c.innerHTML = header("Escolas", E ? `<button class="btn" id="btNova">+ Nova escola</button>` : "") + `<div id="bd"></div>`;
  const b = new Board($("#bd"), {
    rows: S.escolas, team: S.team, groupBy: e => e.situacao === "ativa" ? "Ativas" : "Ex-clientes", groupColor: k => k === "Ativas" ? "#3560b5" : "#a9a9a9",
    searchText: e => [e.nome, e.cnpj, e.codigo, e.dre, ...(e.aliases || [])].join(" "),
    columns: [
      { key: "nome", label: "Escola", type: "name", width: 280, sub: e => `${esc(e.cnpj || "")}` },
      { key: "codigo", label: "ID", type: "text", width: 70, editable: E },
      { key: "dre", label: "DRE", type: "text", width: 60, editable: E },
      { key: "grupo", label: "Grupo", type: "status", dict: ST.grupo, width: 80, editable: E, battery: true },
      { key: "situacao", label: "Situação", type: "status", dict: { ativa: { label: "Ativa", color: "#63b231" }, "ex-cliente": { label: "Ex-cliente", color: "#a9a9a9" } }, width: 100, editable: E, battery: false },
      { key: "honorario", label: "Mensalidade", type: "money", width: 110, editable: isMaster() },
      { key: "responsaveis", label: "Responsáveis", type: "people", width: 120, editable: E },
      ...(tem("acessos") ? [
        { key: "sig_login", label: "SIG – login", type: "custom", width: 150, fget: e => acc[e.id]?.sig_login || "", render: e => acc[e.id]?.sig_login ? `<span class="mono">${esc(acc[e.id].sig_login)}</span> <button class="btn ghost sm" data-cpl="${e.id}" title="Copiar login">⧉</button>` : `<span class="muted small">–</span>` },
        { key: "sig_senha", label: "SIG – senha", type: "custom", width: 150, render: e => acc[e.id] ? `<span class="mono" data-pw="${e.id}">••••••</span> <button class="btn ghost sm" data-ver="${e.id}" title="Mostrar senha">👁</button>` : `<span class="muted small">–</span>` },
      ] : []),
      { key: "procuracao_validade", label: "Procuração", type: "date", width: 100, editable: E },
      { key: "chave", label: "Chave do portal", type: "custom", width: 150, fget: e => e.chave || "", render: e => e.chave ? `<span class="mono">${fmtKey(e.chave)}</span> <button class="btn ghost sm" data-cp="${e.id}" title="Copiar mensagem com link">⧉</button>` : `<span class="muted small">sem chave</span>` },
    ],
    onOpen: e => fichaEscola(e.id),
    onEdit: async (e, key, v) => { await S.api.update("escolas", { id: e.id }, { [key]: v }); },
    afterRender: el => {
      $$("[data-cp]", el).forEach(btn => btn.onclick = () => copiarLink(S.esc[btn.dataset.cp]));
      $$("[data-cpl]", el).forEach(btn => btn.onclick = async () => { try { await navigator.clipboard.writeText(acc[btn.dataset.cpl].sig_login); toast("Login copiado"); } catch {} });
      $$("[data-ver]", el).forEach(btn => btn.onclick = async () => {
        const span = el.querySelector(`[data-pw="${btn.dataset.ver}"]`);
        if (btn.dataset.on){ span.textContent = "••••••"; btn.textContent = "👁"; delete btn.dataset.on; return; }
        const a = await S.api.rpc("ver_acessos", { p_escola: btn.dataset.ver }) || {};
        span.textContent = a.sig_senha || "(sem senha)"; btn.textContent = "🙈"; btn.dataset.on = 1;
        try { if (a.sig_senha) { await navigator.clipboard.writeText(a.sig_senha); toast("Senha copiada"); } } catch {}
      });
    },
  });
  if ($("#btNova")) $("#btNova").onclick = () => editarEscola(null, () => { b.rows = S.escolas; });
}
async function copiarLink(e){
  const txt = `Olá! Este é o acesso da ${e.nome} ao portal da FAG Escolas (renovação de contrato, mensalidades, pendências e solicitações):\n${linkEscola(e.chave)}\nChave de acesso: ${fmtKey(e.chave)}`;
  try { await navigator.clipboard.writeText(txt); toast("Mensagem com link copiada"); } catch { prompt("Copie:", txt); }
}
function editarEscola(e, done){
  const n = !e; e = e || { situacao: "ativa", grupo: "A", responsaveis: [] };
  const f = (k, l, t = "text") => `<div class="field"><label class="f">${l}</label><input class="in" data-k="${k}" type="${t}" value="${esc(e[k] ?? "")}" ${t === "number" ? 'step="0.01"' : ""}></div>`;
  const m = modal(`<h2>${n ? "Nova escola" : "Editar dados"}</h2>
    ${f("nome", "Nome")}<div class="grid3">${f("cnpj", "CNPJ")}${f("codigo", "ID interno")}${f("dre", "DRE")}</div>
    <div class="grid3">${f("ccm", "CCM")}${f("telefone", "Telefone")}${f("procuracao_validade", "Validade da procuração", "date")}</div>
    ${f("email", "E-mail", "email")}
    <div class="grid3"><div class="field"><label class="f">Grupo</label><select class="in" data-k="grupo"><option ${e.grupo === "A" ? "selected" : ""}>A</option><option ${e.grupo === "B" ? "selected" : ""}>B</option></select></div>
      ${isMaster() || n ? f("honorario", "Mensalidade vigente", "number") : ""}
      <div class="field"><label class="f">Situação</label><select class="in" data-k="situacao"><option value="ativa">Ativa</option><option value="ex-cliente" ${e.situacao === "ex-cliente" ? "selected" : ""}>Ex-cliente</option></select></div></div>
    <div class="field"><label class="f">Outros nomes (como aparece no monday, separados por ;)</label><input class="in" data-k="aliases" value="${esc((e.aliases || []).join("; "))}"></div>
    <div class="field"><label class="f">Observações</label><textarea class="in" data-k="obs" rows="2">${esc(e.obs || "")}</textarea></div>
    <div style="display:flex;gap:8px"><button class="btn" id="ok">Salvar</button><button class="btn sec" id="cx">Cancelar</button></div><div class="err" id="er"></div>`, { wide: true });
  m.q("#cx").onclick = m.close;
  m.q("#ok").onclick = async () => {
    const d = {}; m.querySelectorAll("[data-k]").forEach(i => { let v = i.value.trim(); d[i.dataset.k] = v === "" ? null : v; });
    d.aliases = (d.aliases || "").split(";").map(s => s.trim()).filter(Boolean);
    if (d.honorario != null) d.honorario = +d.honorario;
    if (!d.nome) return m.q("#er").textContent = "Informe o nome.";
    if (d.cnpj && onlyDig(d.cnpj).length !== 14) return m.q("#er").textContent = "CNPJ inválido.";
    try {
      if (n){ d.chave = newKey(); const [x] = await S.api.insert("escolas", d); S.escolas.push(x); }
      else { const [x] = await S.api.update("escolas", { id: e.id }, d); Object.assign(e, x); }
      setEscolas(S.escolas.sort((a, b) => a.nome.localeCompare(b.nome))); m.close(); toast("Salvo"); done?.();
    } catch (err){ m.q("#er").textContent = err.message; }
  };
}

/* =============== FICHA 360° DA ESCOLA =============== */
async function fichaEscola(id, tab = "resumo"){
  const e = S.esc[id]; if (!e) return;
  document.querySelector(".drawer-bg")?.remove(); document.querySelector(".drawer")?.remove();
  const bg = document.createElement("div"); bg.className = "drawer-bg"; const d = document.createElement("div"); d.className = "drawer";
  document.body.append(bg, d); const close = () => { bg.remove(); d.remove(); }; bg.onclick = close;
  const tabs = [["resumo","Resumo"],["dados","Dados e acessos"],tem("contratos") && ["contratos","Contratos"],tem("mensalidades") && ["mensalidades","Mensalidades"],
    tem("prestacoes") && ["prestacoes","Prestações"],(tem("contabil") || tem("atas")) && ["contabil","Contábil e ATA"],tem("tarefas") && ["tarefas","Tarefas"],(tem("escolas") || tem("contabil") || tem("atas")) && ["arquivos","Arquivos"]].filter(Boolean);
  d.innerHTML = `<div class="drawer-h"><div style="display:flex;gap:10px;align-items:flex-start"><div style="flex:1"><h2 style="margin:0">${esc(e.nome)}</h2>
      <div class="small muted">CNPJ ${esc(e.cnpj || "–")} · ID ${esc(e.codigo || "–")} · DRE ${esc(e.dre || "–")} · ${chip(ST.grupo, e.grupo, { cls: "mini" })} ${e.situacao !== "ativa" ? '<span class="tag">Ex-cliente</span>' : ""}</div></div>
      <button class="btn sec sm" id="fx">✕</button></div>
      <div class="tabs" style="margin-top:12px">${tabs.map(([k, l]) => `<button class="tab ${k === tab ? "on" : ""}" data-t="${k}">${l}</button>`).join("")}</div></div><div class="drawer-b" id="fb"></div>`;
  d.querySelector("#fx").onclick = close;
  $$(".tab", d).forEach(t => t.onclick = () => { $$(".tab", d).forEach(x => x.classList.toggle("on", x === t)); show(t.dataset.t); });
  const fb = d.querySelector("#fb");
  async function show(t){
    fb.innerHTML = `<div class="muted">Carregando…</div>`;
    try { await ({ resumo: fResumo, dados: fDados, contratos: fContratos, mensalidades: fMens, prestacoes: fPrest, contabil: fContabil, tarefas: fTarefas, arquivos: fArquivos })[t](fb, e, () => show(t)); }
    catch (err){ fb.innerHTML = `<div class="notice bad">${esc(err.message)}</div>`; }
  }
  show(tab);
}
async function fResumo(fb, e, again){
  const ano = thisYear(); const hoje = today(); const mesAtual = hoje.slice(0, 7) + "-01";
  const [mens, tar, prest] = await Promise.all([tem("mensalidades") ? S.api.select("mensalidades", { eq: { escola_id: e.id } }) : [], tem("tarefas") ? S.api.select("tarefas", { eq: { escola_id: e.id } }) : [], tem("prestacoes") ? S.api.select("prestacoes", { eq: { escola_id: e.id, ano } }) : []]);
  const atr = mens.filter(m => ["em_atraso","cobrado"].includes(m.status) || (m.status === "a_receber" && m.competencia < mesAtual));
  fb.innerHTML = `
    <div class="card"><h3>Portal da escola</h3>
      ${e.chave ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="mono" style="font-size:22px;letter-spacing:3px">${fmtKey(e.chave)}</span>
        <button class="btn sm" id="cpL">Copiar mensagem com link</button><a class="btn sm sec" href="${linkEscola(e.chave)}" target="_blank" rel="noopener">Abrir portal</a>
        ${edita("escolas") ? `<button class="btn sm sec" id="novaK">Gerar nova chave</button>` : ""}</div>
        <div class="small muted" style="margin-top:6px">${esc(linkEscola(e.chave))}</div>`
      : `<p class="muted">Esta escola ainda não tem chave.</p>${edita("escolas") ? `<button class="btn" id="novaK">Gerar chave e link</button>` : ""}`}
    </div>
    <div class="kpis">
      <div class="kpi"><div class="l">Mensalidade vigente</div><div class="v">${brl(e.honorario)}</div><div class="s">Grupo ${e.grupo || "–"}</div></div>
      ${tem("mensalidades") ? `<div class="kpi"><div class="l">Em atraso</div><div class="v" style="${atr.length ? "color:var(--bad)" : ""}">${brl(atr.reduce((a, m) => a + (+m.valor || 0), 0))}</div><div class="s">${atr.map(m => compLabel(m.competencia)).join(", ") || "Em dia"}</div></div>` : ""}
      ${tem("tarefas") ? `<div class="kpi"><div class="l">Tarefas abertas</div><div class="v">${tar.filter(t => t.status !== "concluida").length}</div><div class="s">${tar.filter(t => t.origem === "escola" && t.status !== "concluida").length} solicitação(ões) da escola</div></div>` : ""}
      ${tem("prestacoes") ? `<div class="kpi"><div class="l">Prestações ${ano}</div><div class="v">${prest.filter(p => p.status === "Entregue").length}/${prest.filter(p => p.status !== "Não tem").length}</div><div class="s">entregues</div></div>` : ""}
    </div>
    <div class="card"><h3>Contato</h3><div class="small">${esc(e.email || "–")} · ${esc(e.telefone || "–")}<br>Procuração válida até ${fmtDate(e.procuracao_validade) || "–"} · Responsáveis FAG: ${esc((e.responsaveis || []).join(", ") || "–")}</div>${e.obs ? `<div class="notice info small">${esc(e.obs)}</div>` : ""}</div>`;
  fb.querySelector("#cpL")?.addEventListener("click", () => copiarLink(e));
  fb.querySelector("#novaK")?.addEventListener("click", async () => {
    if (e.chave && !confirm("Gerar uma nova chave? O link antigo para de funcionar.")) return;
    const k = newKey(); await S.api.update("escolas", { id: e.id }, { chave: k }); e.chave = k; audit("nova_chave", "escolas", e.id); toast("Nova chave gerada"); again();
  });
}
async function fDados(fb, e, again){
  fb.innerHTML = `<div class="card"><div style="display:flex;justify-content:space-between"><h3>Cadastro</h3>${edita("escolas") ? `<button class="btn sm" id="ed">Editar</button>` : ""}</div>
    <table class="summary" style="width:100%">${[["Nome", e.nome], ["CNPJ", e.cnpj], ["CCM", e.ccm], ["ID interno", e.codigo], ["DRE", e.dre], ["E-mail", e.email], ["Telefone", e.telefone],
      ["Procuração até", fmtDate(e.procuracao_validade)], ["Grupo", e.grupo], ["Mensalidade vigente", brl(e.honorario)], ["Outros nomes", (e.aliases || []).join("; ")]]
      .map(([l, v]) => `<tr><td class="muted" style="width:180px;padding:5px 0">${l}</td><td>${esc(v || "–")}</td></tr>`).join("")}</table></div>
    ${tem("acessos") ? `<div class="card"><h3>Acessos (SIG / Senha Web)</h3><p class="small muted">${edita("acessos") ? "Você pode ver e alterar." : "Você pode ver."} Cada consulta fica registrada.</p>
      <div id="acc"><button class="btn sm sec" id="verAcc">Mostrar acessos</button></div></div>` : ""}`;
  fb.querySelector("#ed")?.addEventListener("click", () => editarEscola(e, again));
  fb.querySelector("#verAcc")?.addEventListener("click", async () => {
    const a = await S.api.rpc("ver_acessos", { p_escola: e.id }) || {};
    const box = fb.querySelector("#acc"); const ro = edita("acessos") ? "" : "readonly";
    box.innerHTML = `<div class="grid3"><div class="field"><label class="f">SIG – login</label><input class="in" id="a1" ${ro} value="${esc(a.sig_login || "")}"></div>
      <div class="field"><label class="f">SIG – senha</label><input class="in" id="a2" ${ro} value="${esc(a.sig_senha || "")}"></div>
      <div class="field"><label class="f">Senha Web</label><input class="in" id="a3" ${ro} value="${esc(a.senha_web || "")}"></div></div>
      ${edita("acessos") ? `<button class="btn sm" id="svA">Salvar acessos</button>` : ""}`;
    box.querySelector("#svA")?.addEventListener("click", async () => {
      try { await S.api.upsert("escolas_acessos", [{ escola_id: e.id, sig_login: box.querySelector("#a1").value || null, sig_senha: box.querySelector("#a2").value || null, senha_web: box.querySelector("#a3").value || null }], "escola_id");
        audit("editar_senha", "escolas_acessos", e.id); toast("Acessos salvos"); } catch (err){ toast("Erro: " + err.message); } });
  });
}
async function fContratos(fb, e){
  const cs = await S.api.select("contratos", { eq: { escola_id: e.id }, order: ["ano", "desc"] });
  const priv = isMaster() ? Object.fromEntries((await S.api.select("contratos_privado", { in: { contrato_id: cs.map(x => x.id) } })).map(p => [p.contrato_id, p])) : {};
  fb.innerHTML = cs.map(x => `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><h3>Contrato ${x.ano}</h3><div>${chip(ST.contrato, x.status)} ${x.ano === S.cfg.ano ? chip(ST.proposta, x.proposta_status) : ""}</div></div>
    <div class="small">Mensalidade base: <b>${brl(x.honorario)}</b>${x.pacotes ? ` · Pacote: <b>${brl(x.pacotes)}</b> · Total: <b>${brl(r2(+x.honorario + +x.pacotes))}</b>` : ""}
    ${priv[x.id]?.honorario_ant ? ` · <span class="muted">Ano anterior: ${brl(priv[x.id].honorario_ant)}</span>` : ""}</div>
    ${x.resp_nome ? `<div class="small muted">Responsável: ${esc(x.resp_nome)} · CPF ${esc(x.resp_cpf || "")} · ${esc(x.resp_email || "")} · ${esc(x.resp_tel || "")}</div>` : ""}
    ${(x.arquivos || []).length ? `<div class="small" style="margin-top:6px">${x.arquivos.map(a => `<a href="${esc(a.url || "#")}" target="_blank" rel="noopener">📎 ${esc(a.nome)}</a>`).join(" · ")}</div>` : ""}</div>`).join("") || `<div class="card muted">Nenhum contrato.</div>`;
}
async function fMens(fb, e){
  const ms = await S.api.select("mensalidades", { eq: { escola_id: e.id }, order: ["competencia"] });
  const anos = [...new Set(ms.map(m => m.competencia.slice(0, 4)))].sort().reverse();
  fb.innerHTML = anos.map(a => { const doAno = ms.filter(m => m.competencia.startsWith(a));
    return `<div class="card"><h3>${a}</h3><div class="mgrid">${MESES.map((mm, i) => { const m = doAno.find(x => +x.competencia.slice(5, 7) === i + 1);
      return `<div><div class="muted">${mm}</div>${m ? chip(ST.mensalidade, m.status, { cls: "mini" }) + `<div>${m.valor != null ? Number(m.valor).toLocaleString("pt-BR") : ""}</div>` : "–"}</div>`; }).join("")}</div>
      <div class="small muted" style="margin-top:8px">Pago no ano: ${brl(doAno.filter(m => m.status === "pago").reduce((s, m) => s + (+m.valor || 0), 0))}</div></div>`; }).join("") || `<div class="card muted">Sem mensalidades lançadas.</div>`;
}
async function fPrest(fb, e){
  const ps = await S.api.select("prestacoes", { eq: { escola_id: e.id }, order: ["ano", "desc"] });
  fb.innerHTML = ps.length ? `<div class="card"><table class="bd">${ps.map(p => `<tr><td>${p.ano}</td><td><b>${p.programa}</b> ${esc(p.referencia)}</td><td>${p.quem_presta ? chip(ST.quem, p.quem_presta, { cls: "mini" }) : ""}</td><td>${chip(ST.prestacao, p.status, { cls: "mini" })}</td>
    <td>${p.programa === "PDDE" ? MESES.map(mm => p.meses?.[mm] ? `<span title="${mm}: ${esc(p.meses[mm])}" style="display:inline-block;width:10px;height:14px;border-radius:2px;background:${ST.mes[p.meses[mm]]?.color || "#ddd"}"></span>` : "").join(" ") : fmtDate(p.entregue_em)}</td></tr>`).join("")}</table></div>` : `<div class="card muted">Sem prestações.</div>`;
}
async function fContabil(fb, e){
  const [bs, as] = await Promise.all([tem("contabil") ? S.api.select("balancetes", { eq: { escola_id: e.id }, order: ["ano", "desc"] }) : [], tem("atas") ? S.api.select("atas", { eq: { escola_id: e.id }, order: ["ano", "desc"] }) : []]);
  fb.innerHTML = (bs.length ? `<div class="card"><h3>Balancetes e obrigações</h3><table class="bd"><tr><th>Ano</th><th>1º Rep.</th><th>2º Rep.</th><th>3º Rep.</th><th>PDDE</th><th>ECD</th><th>ECF</th></tr>${bs.map(b => `<tr><td>${b.ano}</td>${["rep1","rep2","rep3","pdde"].map(k => `<td>${chip(ST.balancete, b[k], { cls: "mini" })}</td>`).join("")}${["ecd","ecf"].map(k => `<td>${chip(ST.obrigacao, b[k], { cls: "mini" })}</td>`).join("")}</tr>`).join("")}</table></div>` : "")
    + (as.length ? `<div class="card"><h3>ATA Bienal</h3>${as.map(a => `<div class="small"><b>${a.ano}</b> · Elaboração: ${esc(a.elaboracao || "–")} · Arquivo: ${chip(ST.ataArquivo, a.arquivo_status, { cls: "mini" })} · Documentos: ${chip(ST.ataDocs, a.documentos_status, { cls: "mini" })} · Pagamento: ${esc(a.pagamento || "–")} ${a.valor_cartorio ? "· Cartório " + brl(a.valor_cartorio) : ""}</div>`).join("")}</div>` : "")
    || `<div class="card muted">Sem registros.</div>`;
}
async function fTarefas(fb, e, again){
  const ts = await S.api.select("tarefas", { eq: { escola_id: e.id }, order: ["criado_em", "desc"] });
  fb.innerHTML = (edita("tarefas") ? `<div style="margin-bottom:10px"><button class="btn sm" id="nt">+ Nova tarefa para esta escola</button></div>` : "") +
    (ts.map(t => `<div class="card" style="padding:12px 16px;cursor:pointer" data-t="${t.id}"><div style="display:flex;justify-content:space-between;gap:10px"><b>${esc(t.titulo)}</b>${chip(ST.tarefa, t.status, { cls: "mini" })}</div>
      <div class="small muted">${t.origem === "escola" ? "📩 Solicitação da escola · " : ""}${esc((t.responsaveis || []).join(", "))} ${t.prazo ? "· prazo " + fmtDate(t.prazo) : ""} ${t.visivel_escola ? "· visível no portal" : ""}</div></div>`).join("") || `<div class="card muted">Nenhuma tarefa.</div>`);
  fb.querySelector("#nt")?.addEventListener("click", () => abrirTarefa({ escola_id: e.id }, again));
  $$("[data-t]", fb).forEach(x => x.onclick = () => abrirTarefa(ts.find(t => t.id === x.dataset.t), again));
}

/* =============== ARQUIVOS DA ESCOLA =============== */
const CATEGORIAS = ["Recibo de cartório", "ATA", "Estatuto", "Contrato", "Balancete", "Prestação de contas", "Extrato bancário", "Nota fiscal", "Documento da escola", "Outros"];
const podeAnexar = () => edita("escolas") || edita("contabil") || edita("atas");
const icone = n => /\.pdf$/i.test(n || "") ? "📕" : /\.(docx?|odt|rtf)$/i.test(n || "") ? "📘" : /\.(xlsx?|ods|csv)$/i.test(n || "") ? "📗" : /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(n || "") ? "🖼️" : "📄";
const tamanho = b => !b ? "" : b > 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
function anexarArquivo(escolaId, pre = {}, done){
  const e = S.esc[escolaId];
  const md = modal(`<h2>Anexar arquivo</h2><div class="small muted" style="margin:-4px 0 12px">${esc(e?.nome || "")}</div>
    <div class="field"><label class="f">Arquivo (PDF, Word, Excel ou foto)</label><input class="in" id="af" type="file" accept=".pdf,.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.csv,.jpg,.jpeg,.png,.webp,.heic,.gif,image/*"></div>
    <div class="grid2"><div class="field"><label class="f">Tipo</label><select class="in" id="ac">${CATEGORIAS.map(c => `<option ${c === (pre.categoria || "Recibo de cartório") ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="field"><label class="f">Ano de referência</label><input class="in" id="aa" type="number" value="${pre.ano || thisYear()}"></div></div>
    <div class="field"><label class="f">O que é este arquivo? *</label><input class="in" id="ad" maxlength="200" placeholder="Ex.: Recibo do cartório – registro da ATA de eleição 2025" value="${esc(pre.descricao || "")}"></div>
    <div style="display:flex;gap:8px"><button class="btn" id="ok">Salvar arquivo</button><button class="btn sec" id="cx">Cancelar</button></div><div class="err" id="er"></div>`);
  md.q("#cx").onclick = md.close;
  md.q("#af").onchange = () => { const f = md.q("#af").files[0]; if (f && !md.q("#ad").value) md.q("#ad").value = f.name.replace(/\.[^.]+$/, ""); };
  md.q("#ok").onclick = async () => {
    const f = md.q("#af").files[0], desc = md.q("#ad").value.trim();
    if (!f) return md.q("#er").textContent = "Escolha o arquivo.";
    if (!desc) return md.q("#er").textContent = "Escreva o que é o arquivo.";
    if (f.size > 45 * 1048576) return md.q("#er").textContent = "Arquivo muito grande (máximo 45 MB).";
    md.q("#ok").disabled = true; md.q("#ok").textContent = "Enviando…";
    try {
      const path = `${escolaId}/${Date.now()}_${f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]/g, "_")}`;
      await S.api.files.upload(path, f);
      await S.api.insert("escola_arquivos", { escola_id: escolaId, categoria: md.q("#ac").value, ano: +md.q("#aa").value || null, descricao: desc,
        nome: f.name, path, tipo: f.type || null, tamanho: f.size, enviado_por: S.me.nome });
      md.close(); toast("Arquivo salvo"); done?.();
    } catch (err){ md.q("#er").textContent = "Não foi possível salvar: " + err.message; md.q("#ok").disabled = false; md.q("#ok").textContent = "Salvar arquivo"; }
  };
}
async function abrirArquivo(a, baixar){
  if (a.url) return window.open(a.url, "_blank", "noopener");
  try { const u = await S.api.files.url(a.path, baixar ? a.nome : undefined); window.open(u, "_blank", "noopener"); } catch (err){ toast("Erro ao abrir: " + err.message); }
}
async function fArquivos(fb, e, again){
  const arqs = await S.api.select("escola_arquivos", { eq: { escola_id: e.id }, order: ["criado_em", "desc"] });
  const cats = [...new Set(arqs.map(a => a.categoria))].sort((a, b) => CATEGORIAS.indexOf(a) - CATEGORIAS.indexOf(b));
  fb.innerHTML = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">${podeAnexar() ? `<button class="btn" id="nArq">📎 Anexar arquivo</button>` : ""}
      <input class="in" id="fq" placeholder="Buscar nos arquivos…" style="max-width:260px"><span class="small muted">${arqs.length} arquivo(s)</span></div>
    <div id="lst">${cats.map(c => `<div class="card" style="padding:14px 18px" data-cat="${esc(c)}"><h3>${esc(c)} <span class="small muted">(${arqs.filter(a => a.categoria === c).length})</span></h3>
      <ul class="list">${arqs.filter(a => a.categoria === c).map(a => `<li data-txt="${esc((a.descricao + " " + (a.nome || "") + " " + (a.ano || "")).toLowerCase())}"><span style="display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:20px">${a.url ? "🔗" : icone(a.nome)}</span><span><b>${esc(a.descricao)}</b><div class="small muted">${a.ano ? a.ano + " · " : ""}${esc(a.nome || "link externo")}${a.tamanho ? " · " + tamanho(a.tamanho) : ""} · ${esc(a.enviado_por || "")} · ${fmtDate(a.criado_em)}</div></span></span>
        <span style="white-space:nowrap"><button class="btn sm sec" data-ab="${a.id}">Abrir</button>${a.path ? ` <button class="btn sm sec" data-dl="${a.id}">Baixar</button>` : ""}${podeAnexar() ? ` <button class="btn sm ghost" data-rm="${a.id}" title="Excluir">🗑</button>` : ""}</span></li>`).join("")}</ul></div>`).join("")
      || `<div class="card muted">Nenhum arquivo ainda.${podeAnexar() ? " Clique em <b>Anexar arquivo</b> para salvar recibos, ATAs, contratos, fotos…" : ""}</div>`}</div>`;
  fb.querySelector("#nArq")?.addEventListener("click", () => anexarArquivo(e.id, {}, again));
  fb.querySelector("#fq").oninput = ev => { const q = ev.target.value.toLowerCase();
    $$("#lst li", fb).forEach(li => li.style.display = li.dataset.txt.includes(q) ? "" : "none");
    $$("#lst [data-cat]", fb).forEach(cd => cd.style.display = [...cd.querySelectorAll("li")].some(li => li.style.display !== "none") ? "" : "none"); };
  $$("[data-ab]", fb).forEach(b => b.onclick = () => abrirArquivo(arqs.find(a => a.id === b.dataset.ab)));
  $$("[data-dl]", fb).forEach(b => b.onclick = () => abrirArquivo(arqs.find(a => a.id === b.dataset.dl), true));
  $$("[data-rm]", fb).forEach(b => b.onclick = async () => { const a = arqs.find(x => x.id === b.dataset.rm);
    if (!confirm(`Excluir "${a.descricao}"? Esta ação não pode ser desfeita.`)) return;
    try { if (a.path) await S.api.files.remove(a.path); await S.api.remove("escola_arquivos", { id: a.id }); audit("excluir_arquivo", "escola_arquivos", e.id, { descricao: a.descricao, nome: a.nome }); toast("Arquivo excluído"); again(); }
    catch (err){ toast("Erro: " + err.message); } });
}
async function contarArquivos(){ try { const r = await S.api.select("escola_arquivos", { cols: "escola_id" }); const m = {}; r.forEach(x => m[x.escola_id] = (m[x.escola_id] || 0) + 1); return m; } catch { return {}; } }
const subAnexo = (nArq, ano, cat) => r => `${podeAnexar() ? `<button class="btn ghost sm" style="padding:0 4px" data-anx="${r.escola_id}" data-ano="${ano}" data-cat="${cat}">📎 Anexar</button>` : ""}${nArq[r.escola_id] ? ` <a href="#" class="small" data-varq="${r.escola_id}">${nArq[r.escola_id]} arquivo(s)</a>` : ""}`;
function ligarAnexos(el, recarregar){
  $$("[data-anx]", el).forEach(b => b.onclick = ev => { ev.stopPropagation(); anexarArquivo(b.dataset.anx, { ano: +b.dataset.ano, categoria: b.dataset.cat }, recarregar); });
  $$("[data-varq]", el).forEach(a => a.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); fichaEscola(a.dataset.varq, "arquivos"); });
}

/* =============== RENOVAÇÃO (proposta + contrato) =============== */
async function pgRenovacao(c){
  const E = edita("contratos");
  const ano = S.cfg.ano;
  const [cs, priv] = await Promise.all([S.api.select("contratos", { eq: { ano } }), isMaster() ? S.api.select("contratos_privado") : []]);
  const pv = Object.fromEntries(priv.map(p => [p.contrato_id, p]));
  const calc = x => { const e = S.esc[x.escola_id] || {}; const m = r2((+x.honorario || 0) / 12);
    const ad = r2((x.ata ? m : 0) + (e.grupo === "B" && x.scan ? m : 0) + (x.guia ? +S.cfg.valorGuia : 0)); return { m, ad, total: r2((+x.honorario || 0) + ad) }; };
  const rows = cs.filter(x => S.esc[x.escola_id]).map(x => ({ ...x, _nome: escNome(x.escola_id), _grupo: S.esc[x.escola_id].grupo, _ant: pv[x.id]?.honorario_ant ?? null, _total: x.proposta_status === "pendente" ? null : calc(x).total }));
  const n = rows.length, cnt = s => rows.filter(r => r.proposta_status === s).length;
  c.innerHTML = header(`Renovação ${ano}`, `${isMaster() ? `<button class="btn sec" id="btExp">Exportar aprovadas (.xlsx)</button>` : ""}<button class="btn sec" id="btKeys">Exportar chaves e links</button>`) + `
    <div class="kpis"><div class="kpi"><div class="l">Escolas</div><div class="v">${n}</div><div class="s">A ${rows.filter(r => r._grupo === "A").length} · B ${rows.filter(r => r._grupo === "B").length}</div></div>
      <div class="kpi"><div class="l">Responderam</div><div class="v">${n - cnt("pendente")}</div><div class="s">${n ? Math.round((n - cnt("pendente")) / n * 100) : 0}%</div></div>
      <div class="kpi"><div class="l">Aguardando aprovação</div><div class="v">${cnt("enviada")}</div><div class="s">Ajuste: ${cnt("ajuste")}</div></div>
      <div class="kpi"><div class="l">Aprovadas</div><div class="v">${cnt("aprovada")}</div><div class="s">Recusadas: ${cnt("recusada")}</div></div>
      ${isMaster() ? `<div class="kpi"><div class="l">Base ${ano} × ano anterior</div><div class="v">${brl(rows.reduce((a, r) => a + (+r.honorario || 0), 0))}</div><div class="s">antes: ${brl(rows.reduce((a, r) => a + (+r._ant || 0), 0))}</div></div>` : ""}
      <div class="kpi"><div class="l">Adicional com pacotes</div><div class="v">${brl(rows.filter(r => r.proposta_status === "aprovada").reduce((a, r) => a + calc(r).ad, 0))}</div><div class="s">por mês (aprovadas)</div></div></div>
    <div id="bd"></div>`;
  const order = ["enviada","ajuste","pendente","aprovada","recusada"];
  new Board($("#bd"), {
    rows, team: S.team, groupBy: r => r.proposta_status, groupOrder: (a, b) => order.indexOf(a) - order.indexOf(b), groupLabel: k => ST.proposta[k]?.label || k, groupColor: k => ST.proposta[k]?.color,
    searchText: r => r._nome,
    columns: [
      { key: "_nome", label: "Escola", type: "name", width: 260 },
      { key: "_grupo", label: "Grupo", type: "status", dict: ST.grupo, width: 70 },
      ...(isMaster() ? [{ key: "_ant", label: "Ano anterior", type: "money", width: 110 }] : []),
      { key: "honorario", label: `Base ${ano}`, type: "money", width: 110, editable: isMaster() },
      { key: "pacote", label: "Pacote escolhido", type: "custom", width: 150, fget: r => r.proposta_status === "pendente" ? "" : ["ata","scan","guia"].filter(k => r[k] && (k !== "scan" || r._grupo === "B")).map(k => ({ ata: "ATA", scan: "Escaneamento", guia: "Guias" })[k]).join(", "), render: r => r.proposta_status === "pendente" ? "" : ["ata","scan","guia"].filter(k => r[k] && (k !== "scan" || r._grupo === "B")).map(k => `<span class="tag">${{ ata: "ATA", scan: "Escan.", guia: "Guias" }[k]}</span>`).join("") || `<span class="muted small">nenhum</span>` },
      { key: "_total", label: "Total c/ pacote", type: "money", width: 120 },
      { key: "status", label: "Contrato", type: "status", dict: ST.contrato, width: 130, editable: E },
      { key: "acoes", label: "", type: "custom", width: 160, render: r => `${r.proposta_status !== "pendente" ? `<button class="btn sm" data-an="${r.id}">${isMaster() && r.proposta_status === "enviada" ? "Analisar" : "Ver"}</button>` : ""} ${S.esc[r.escola_id]?.chave ? `<a class="btn sm sec" href="${linkEscola(S.esc[r.escola_id].chave)}" target="_blank" rel="noopener">Preencher</a>` : ""}` },
    ],
    onOpen: r => fichaEscola(r.escola_id, "contratos"),
    onEdit: async (r, key, v) => { await S.api.update("contratos", { id: r.id }, { [key]: v }); if (key === "honorario" && r._total != null) r._total = calc(r).total; },
    afterRender: el => $$("[data-an]", el).forEach(b => b.onclick = () => analisarProposta(rows.find(r => r.id === b.dataset.an), calc, () => pgRenovacao(c))),
  });
  $("#btKeys").onclick = async () => { const X = await xlsx(); writeX(X, S.escolas.filter(e => e.situacao === "ativa").map(e => ({ Escola: e.nome, CNPJ: e.cnpj, Grupo: e.grupo, Chave: fmtKey(e.chave), Link: e.chave ? linkEscola(e.chave) : "" })), "Chaves", `chaves_escolas.xlsx`); };
  if ($("#btExp")) $("#btExp").onclick = async () => {
    const ap = rows.filter(r => r.proposta_status === "aprovada"); if (!ap.length) return toast("Nenhuma aprovada ainda.");
    const X = await xlsx(); writeX(X, ap.map(r => { const v = r.valores || calc(r); return { "Nome da escola": r._nome, CNPJ: S.esc[r.escola_id].cnpj, "Responsável": r.resp_nome, CPF: r.resp_cpf, Cargo: r.resp_cargo || "",
      "Valor da mensalidade": +r.honorario, "Valor pacote adicional": v.adicional ?? v.ad, "Mensalidade total": v.total, "Serviços": ["ata","scan","guia"].filter(k => r[k] && (k !== "scan" || r._grupo === "B")).map(k => ({ ata: "ATA", scan: "Escaneamento", guia: "Recálculo de guias" })[k]).join("; "),
      "Vigência": S.cfg.vigencia, "E-mail": r.resp_email, Telefone: r.resp_tel }; }), "Contratos", `contratos_aprovados_${ano}.xlsx`); };
}
function analisarProposta(r, calc, done){
  const e = S.esc[r.escola_id]; const v = calc(r); const m = isMaster();
  const linhas = [["Mensalidade base", +r.honorario], r.ata && ["Alteração de ATAs, Estatuto e DBE", v.m], (e.grupo === "B" && r.scan) && ["Notas escaneadas para o SEI", v.m], r.guia && ["Recálculo de guias e TFE", +S.cfg.valorGuia]].filter(Boolean);
  const md = modal(`<div style="display:flex;justify-content:space-between;gap:10px"><h2>${esc(e.nome)}</h2>${chip(ST.proposta, r.proposta_status)}</div>
    ${m && r._ant ? `<div class="notice info small">Ano anterior ${brl(r._ant)} → base ${brl(r.honorario)} (${((r.honorario / r._ant - 1) * 100).toFixed(1).replace(".", ",")}%) · total com pacote ${brl(v.total)} (${((v.total / r._ant - 1) * 100).toFixed(1).replace(".", ",")}%)</div>` : ""}
    <table class="list" style="width:100%">${linhas.map(([l, x]) => `<tr><td style="padding:6px 0">${l}</td><td style="text-align:right"><b>${brl(x)}</b></td></tr>`).join("")}<tr><td style="padding:8px 0;font-size:16px"><b>Total</b></td><td style="text-align:right;font-size:18px"><b>${brl(v.total)}</b></td></tr></table>
    <div class="small"><b>${esc(r.resp_nome || "")}</b> · CPF ${esc(r.resp_cpf || "")} ${r.resp_cargo ? "· " + esc(r.resp_cargo) : ""}<br>${esc(r.resp_tel || "")} · ${esc(r.resp_email || "")}</div>
    ${r.obs_escola ? `<div class="notice info small"><b>Observação da escola:</b> ${esc(r.obs_escola)}</div>` : ""}
    <div class="small muted">Enviada em ${fmtDate(r.enviada_em)} por ${esc(r.enviada_por || "escola")}${r.decidido_em ? ` · decisão em ${fmtDate(r.decidido_em)} por ${esc(r.decidido_por || "")}` : ""}</div>
    ${m && r.proposta_status !== "aprovada" ? `<div class="field" style="margin-top:12px"><label class="f">Mensagem para a escola (obrigatória para ajuste ou recusa)</label><textarea class="in" id="ob" rows="2">${esc(r.obs_fag || "")}</textarea></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ok" data-d="aprovada">Aprovar</button><button class="btn warn" data-d="ajuste">Pedir ajuste</button><button class="btn bad" data-d="recusada">Recusar</button><span style="flex:1"></span><button class="btn sec" id="cx">Fechar</button></div>`
      : `<div style="display:flex;gap:8px;margin-top:12px">${m && r.proposta_status === "aprovada" ? `<button class="btn sec" id="reab">Reabrir para a escola</button>` : ""}<span style="flex:1"></span><button class="btn sec" id="cx">Fechar</button></div>`}`);
  md.q("#cx").onclick = md.close;
  md.querySelectorAll("[data-d]").forEach(b => b.onclick = async () => {
    const st = b.dataset.d, ob = md.q("#ob").value.trim(); if (st !== "aprovada" && !ob) return toast("Escreva a mensagem para a escola.");
    const patch = { proposta_status: st, obs_fag: ob, decidido_em: new Date().toISOString(), decidido_por: S.me.nome };
    if (st === "aprovada") Object.assign(patch, { pacotes: v.ad, status: r.status === "elaboracao" ? "aceito" : r.status, valores: { base: +r.honorario, adicional: v.ad, total: v.total, ata: r.ata, scan: e.grupo === "B" && r.scan, guia: r.guia, vigencia: S.cfg.vigencia } });
    if (st === "recusada") patch.status = "recusado";
    await S.api.update("contratos", { id: r.id }, patch); audit("proposta_" + st, "contratos", r.id); md.close(); toast("Proposta " + ST.proposta[st].label.toLowerCase()); done(); });
  md.q("#reab")?.addEventListener("click", async () => { await S.api.update("contratos", { id: r.id }, { proposta_status: "enviada" }); md.close(); done(); });
}
async function xlsx(){ return window._X ||= await import("https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs"); }
function writeX(X, rows, sheet, fname){ const ws = X.utils.json_to_sheet(rows); ws["!cols"] = Object.keys(rows[0] || {}).map(k => ({ wch: Math.min(60, Math.max(k.length, ...rows.map(r => String(r[k] ?? "").length)) + 2) }));
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, sheet); X.writeFile(wb, fname); }

/* =============== MENSALIDADES =============== */
async function pgMensalidades(c, ano){
  const E = edita("mensalidades");
  ano = ano || +($("#selAno")?.value) || thisYear();
  const ms = await S.api.select("mensalidades", { gte: { competencia: `${ano}-01-01` }, lte: { competencia: `${ano}-12-01` } });
  const rows = ms.filter(m => S.esc[m.escola_id]).map(m => ({ ...m, _nome: escNome(m.escola_id) })).sort((a, b) => a._nome.localeCompare(b._nome));
  const anos = [thisYear() - 1, thisYear(), thisYear() + 1, S.cfg.ano];
  const pago = rows.filter(r => r.status === "pago").reduce((a, r) => a + (+r.valor || 0), 0), tot = rows.reduce((a, r) => a + (+r.valor || 0), 0);
  const hojeComp = today().slice(0, 7) + "-01";
  const atr = rows.filter(r => r.status === "em_atraso" || r.status === "cobrado" || (r.status === "a_receber" && r.competencia < hojeComp));
  c.innerHTML = header("Mensalidades", `${anoSel("selAno", anos, ano)} ${E ? `<button class="btn" id="btGerar">Gerar mensalidades</button>` : ""}`) + `
    <div class="kpis"><div class="kpi"><div class="l">Previsto ${ano}</div><div class="v">${brl(tot)}</div><div class="s">${rows.length} lançamentos</div></div>
      <div class="kpi"><div class="l">Recebido</div><div class="v">${brl(pago)}</div><div class="s">${tot ? Math.round(pago / tot * 100) : 0}% do previsto</div></div>
      <div class="kpi"><div class="l">Em atraso</div><div class="v" style="color:var(--bad)">${brl(atr.reduce((a, r) => a + (+r.valor || 0), 0))}</div><div class="s">${atr.length} mensalidade(s)</div></div>
      <div class="kpi"><div class="l">Pacotes no ano</div><div class="v">${rows.filter(r => r.ata).length} · ${rows.filter(r => r.esc).length} · ${rows.filter(r => r.guia).length}</div><div class="s">ATA · Escaneamento · Guias</div></div></div>
    <div id="bd"></div>`;
  $("#selAno").onchange = () => pgMensalidades(c, +$("#selAno").value);
  const mesAtual = hojeComp;
  new Board($("#bd"), {
    rows, team: S.team, groupBy: r => r.competencia, groupOrder: (a, b) => (a === mesAtual ? -1 : b === mesAtual ? 1 : b.localeCompare(a)),
    groupLabel: k => "Mensalidades – " + compLabel(k) + (k === mesAtual ? " (mês atual)" : ""), collapsed: new Set(rows.map(r => r.competencia).filter(k => k !== mesAtual)),
    searchText: r => r._nome,
    columns: [
      { key: "_nome", label: "Escola", type: "name", width: 260 },
      { key: "responsaveis", label: "Responsável", type: "people", width: 100, editable: E },
      { key: "ata", label: "ATA", type: "check", width: 50, editable: E }, { key: "esc", label: "Esc", type: "check", width: 50, editable: E }, { key: "guia", label: "Guia", type: "check", width: 50, editable: E },
      { key: "cartorio", label: "Cartório", type: "money", width: 90, editable: E },
      { key: "forma", label: "Forma", type: "status", dict: DICT_FORMA, width: 100, editable: E, clearable: true, battery: false },
      { key: "valor", label: "Valor", type: "money", width: 100, editable: E },
      { key: "status", label: "Status", type: "status", dict: ST.mensalidade, width: 120, editable: E },
      { key: "data", label: "Data", type: "date", width: 100, editable: E },
      { key: "obs", label: "Obs.", type: "text", width: 160, editable: E },
    ],
    onOpen: r => fichaEscola(r.escola_id, "mensalidades"),
    onEdit: async (r, key, v) => { const p = { [key]: v }; if (key === "status" && v === "pago" && !r.data){ p.data = today(); r.data = p.data; } await S.api.update("mensalidades", { id: r.id }, p); },
  });
  if ($("#btGerar")) $("#btGerar").onclick = () => gerarMensalidades(ano, () => pgMensalidades(c, ano));
}
function gerarMensalidades(anoAtual, done){
  const md = modal(`<h2>Gerar mensalidades</h2><p class="small muted">Cria os 12 meses de cada escola ativa. Mensalidades que já existem não são alteradas.</p>
    <div class="grid2"><div class="field"><label class="f">Ano</label><input class="in" id="ga" type="number" value="${S.cfg.ano}"></div>
    <div class="field"><label class="f">Valor de quem não teve proposta aprovada</label><select class="in" id="gv"><option value="base">Base do contrato do ano</option><option value="vig">Mensalidade vigente da escola</option><option value="nao">Não gerar</option></select></div></div>
    <div class="notice info small">Quem teve a proposta <b>aprovada</b> entra com base + pacote, já marcando ATA / Escaneamento / Guia.</div>
    <div style="display:flex;gap:8px"><button class="btn" id="ok">Gerar</button><button class="btn sec" id="cx">Cancelar</button></div><div class="err" id="er"></div>`);
  md.q("#cx").onclick = md.close;
  md.q("#ok").onclick = async () => {
    const ano = +md.q("#ga").value, modo = md.q("#gv").value;
    const cs = Object.fromEntries((await S.api.select("contratos", { eq: { ano } })).map(x => [x.escola_id, x]));
    const novos = [];
    for (const e of S.escolas.filter(x => x.situacao === "ativa")){
      const ct = cs[e.id]; let valor, ata = false, es = false, guia = false;
      if (ct?.proposta_status === "aprovada"){ valor = r2(+ct.honorario + (+ct.pacotes || 0)); ata = ct.ata; es = e.grupo === "B" && ct.scan; guia = ct.guia; }
      else if (modo === "base" && ct?.honorario) valor = +ct.honorario; else if (modo === "vig" && e.honorario) valor = +e.honorario; else continue;
      for (let m = 1; m <= 12; m++) novos.push({ escola_id: e.id, competencia: `${ano}-${String(m).padStart(2, "0")}-01`, valor, ata, esc: es, guia, status: "a_receber", responsaveis: e.responsaveis || [] });
    }
    try { const r = await S.api.upsert("mensalidades", novos, "escola_id,competencia", { ignoreDuplicates: true }); md.close(); toast(`${novos.length / 12} escolas × 12 meses processadas`); done(); }
    catch (err){ md.q("#er").textContent = err.message; }
  };
}

/* =============== PRESTAÇÕES =============== */
async function pgPrestacoes(c, prog, ano){
  const E = edita("prestacoes");
  prog = prog || "PTRF"; ano = ano || thisYear();
  const ps = await S.api.select("prestacoes", { eq: { programa: prog, ano } });
  const rows = ps.filter(p => S.esc[p.escola_id]).map(p => ({ ...p, _nome: escNome(p.escola_id) })).sort((a, b) => a._nome.localeCompare(b._nome));
  c.innerHTML = header("Prestações de contas", `<div class="tabs">${["PTRF","PDDE"].map(p => `<button class="tab ${p === prog ? "on" : ""}" data-pg="${p}">${p}</button>`).join("")}</div>
    ${anoSel("selAno", [thisYear() - 1, thisYear(), thisYear() + 1, ano], ano)} ${E ? `<button class="btn" id="btNovo">+ Criar para todas as escolas</button>` : ""}`) + `<div id="bd"></div>`;
  $$("[data-pg]", c).forEach(b => b.onclick = () => pgPrestacoes(c, b.dataset.pg, ano));
  $("#selAno").onchange = () => pgPrestacoes(c, prog, +$("#selAno").value);
  const base = [{ key: "_nome", label: "Escola", type: "name", width: 250 }, { key: "responsaveis", label: "Responsável", type: "people", width: 100, editable: E }];
  const cols = prog === "PTRF" ? [...base,
      { key: "quem_presta", label: "Prestação", type: "status", dict: ST.quem, width: 110, editable: E, clearable: true },
      { key: "status", label: "Status", type: "status", dict: ST.prestacao, width: 130, editable: E },
      { key: "prioridade", label: "Prioridade", type: "text", width: 90, editable: E },
      { key: "inicio", label: "Início", type: "date", width: 100, editable: E }, { key: "prazo", label: "Prazo", type: "date", width: 100, editable: E },
      { key: "entregue_em", label: "Entregue em", type: "date", width: 100, editable: E }, { key: "obs", label: "Obs.", type: "text", width: 160, editable: E }]
    : [...base, { key: "status", label: "Status", type: "status", dict: ST.prestacao, width: 130, editable: E },
      ...MESES.map(mm => ({ key: "m_" + mm, label: mm, type: "status", dict: ST.mes, width: 46, editable: E, clearable: true, battery: false,
        get: r => r.meses?.[mm] || null, set: (r, v) => { r.meses = { ...(r.meses || {}) }; if (v) r.meses[mm] = v; else delete r.meses[mm]; } })),
      { key: "obs", label: "Obs.", type: "text", width: 160, editable: E }];
  new Board($("#bd"), {
    rows, team: S.team, groupBy: r => r.referencia, groupLabel: k => `${prog} ${ano} – ${k}`, searchText: r => r._nome, columns: cols,
    onOpen: r => fichaEscola(r.escola_id, "prestacoes"),
    onEdit: async (r, key, v) => { const p = key.startsWith("m_") ? { meses: r.meses } : { [key]: v }; if (key === "status" && v === "Entregue" && !r.entregue_em){ p.entregue_em = today(); r.entregue_em = p.entregue_em; } await S.api.update("prestacoes", { id: r.id }, p); },
    afterRender: el => { if (prog === "PDDE") el.querySelectorAll("table.bd .chip").forEach(ch => { if (ch.textContent.length > 12){ ch.classList.add("mini"); } }); },
  });
  if ($("#btNovo")) $("#btNovo").onclick = () => criarParaTodas("prestacoes", { programa: prog, ano }, prog === "PTRF" ? "Referência (ex.: 3º Repasse)" : "Referência (Básico, Estrutura, Qualidade…)", ref => ({ referencia: ref, status: "Não iniciado" }), "escola_id,ano,programa,referencia", () => pgPrestacoes(c, prog, ano));
}
function criarParaTodas(tabela, fixos, pergunta, extra, conflict, done){
  const md = modal(`<h2>Criar para todas as escolas ativas</h2>${pergunta ? `<div class="field"><label class="f">${pergunta}</label><input class="in" id="ref"></div>` : ""}
    <div class="field"><label class="f">Ano</label><input class="in" id="ano" type="number" value="${fixos.ano}"></div>
    <div style="display:flex;gap:8px"><button class="btn" id="ok">Criar</button><button class="btn sec" id="cx">Cancelar</button></div>`);
  md.q("#cx").onclick = md.close;
  md.q("#ok").onclick = async () => { const ref = md.q("#ref")?.value.trim(); if (pergunta && !ref) return;
    const rows = S.escolas.filter(e => e.situacao === "ativa").map(e => ({ ...fixos, ano: +md.q("#ano").value, escola_id: e.id, responsaveis: e.responsaveis || [], ...extra(ref) }));
    await S.api.upsert(tabela, rows, conflict, { ignoreDuplicates: true }); md.close(); toast("Criado"); done(); };
}

/* =============== CONTÁBIL / ATA =============== */
async function pgContabil(c, ano){
  const E = edita("contabil");
  ano = ano || thisYear();
  const bs = await S.api.select("balancetes", { eq: { ano } });
  const rows = bs.filter(b => S.esc[b.escola_id]).map(b => ({ ...b, _nome: escNome(b.escola_id) })).sort((a, b) => a._nome.localeCompare(b._nome));
  const nArq = await contarArquivos();
  c.innerHTML = header("Contábil — balancetes e obrigações", `${anoSel("selAno", [thisYear() - 1, thisYear(), thisYear() + 1, ano], ano)} ${E ? `<button class="btn" id="btNovo">+ Criar ano para todas</button>` : ""}`) + `<div id="bd"></div>`;
  $("#selAno").onchange = () => pgContabil(c, +$("#selAno").value);
  const st = (k, l, d) => ({ key: k, label: l, type: "status", dict: d, width: 120, editable: E, clearable: true });
  new Board($("#bd"), { rows, team: S.team, groupLabel: () => `Balancete ${ano}`, groupBy: () => ano, searchText: r => r._nome,
    columns: [{ key: "_nome", label: "Escola", type: "name", width: 250, sub: subAnexo(nArq, ano, "Balancete") }, { key: "responsaveis", label: "Responsável", type: "people", width: 100, editable: E },
      st("rep1", `1º Repasse`, ST.balancete), st("rep2", "2º Repasse", ST.balancete), st("rep3", "3º Repasse", ST.balancete), st("pdde", "PDDE", ST.balancete),
      st("ecd", "ECD", ST.obrigacao), st("ecf", "ECF", ST.obrigacao), { key: "obs", label: "Obs.", type: "text", width: 150, editable: E }],
    onOpen: r => fichaEscola(r.escola_id, "contabil"), onEdit: (r, k, v) => S.api.update("balancetes", { id: r.id }, { [k]: v }),
    afterRender: el => ligarAnexos(el, () => pgContabil(c, ano)) });
  if ($("#btNovo")) $("#btNovo").onclick = () => criarParaTodas("balancetes", { ano }, null, () => ({ rep1: "Não iniciado", rep2: "Não iniciado", rep3: "Não iniciado", pdde: "Não iniciado" }), "escola_id,ano", () => pgContabil(c, ano));
}
async function pgAtas(c, ano){
  const E = edita("atas");
  const all = await S.api.select("atas");
  const anos = [...new Set(all.map(a => a.ano))]; ano = ano || Math.max(...anos, thisYear() - 1);
  const rows = all.filter(a => a.ano === ano && S.esc[a.escola_id]).map(a => ({ ...a, _nome: escNome(a.escola_id) })).sort((a, b) => a._nome.localeCompare(b._nome));
  const nArq = await contarArquivos();
  c.innerHTML = header("ATA Bienal", `${anoSel("selAno", [...anos, thisYear(), thisYear() + 1], ano)} ${E ? `<button class="btn" id="btNovo">+ Criar ano para todas</button>` : ""}`) + `<div id="bd"></div>`;
  $("#selAno").onchange = () => pgAtas(c, +$("#selAno").value);
  const quem = { FAG: ST.quem.FAG, ESCOLA: ST.quem.ESCOLA };
  new Board($("#bd"), { rows, groupBy: () => ano, groupLabel: () => `Escolas – ${ano}`, searchText: r => r._nome,
    columns: [{ key: "_nome", label: "Escola", type: "name", width: 250, sub: subAnexo(nArq, ano, "Recibo de cartório") },
      { key: "elaboracao", label: "Elaboração", type: "status", dict: quem, width: 100, editable: E, clearable: true },
      { key: "arquivo_status", label: "Arquivo ATA", type: "status", dict: ST.ataArquivo, width: 130, editable: E, clearable: true },
      { key: "documentos_status", label: "Documentos", type: "status", dict: ST.ataDocs, width: 100, editable: E, clearable: true },
      { key: "data_envio", label: "Envio p/ escola", type: "date", width: 110, editable: E },
      { key: "pagamento", label: "Pagamento", type: "status", dict: ST.ataPag, width: 130, editable: E, clearable: true },
      { key: "data_entrada_ata", label: "Entrada ATA", type: "date", width: 105, editable: E }, { key: "data_entrada_termo", label: "Entrada termo", type: "date", width: 105, editable: E },
      { key: "valor_cartorio", label: "Cartório", type: "money", width: 100, editable: E }],
    onOpen: r => fichaEscola(r.escola_id, "contabil"), onEdit: (r, k, v) => S.api.update("atas", { id: r.id }, { [k]: v }),
    afterRender: el => ligarAnexos(el, () => pgAtas(c, ano)) });
  if ($("#btNovo")) $("#btNovo").onclick = () => criarParaTodas("atas", { ano: thisYear() + 1 }, null, () => ({ arquivo_status: "Não recebido", documentos_status: "Não feito" }), "escola_id,ano", () => pgAtas(c));
}

/* =============== TAREFAS E SOLICITAÇÕES =============== */
let vistaTarefas = "tabela";
async function pgTarefas(c){
  const E = edita("tarefas");
  const ts = await S.api.select("tarefas", { order: ["criado_em", "desc"] });
  const rows = ts.map(t => ({ ...t, _escola: t.escola_id ? escNome(t.escola_id) : "FAG / geral" }));
  const f = pgTarefas.f ||= { origem: "", resp: "" };
  const fil = rows.filter(r => (!f.origem || r.origem === f.origem) && (!f.resp || (r.responsaveis || []).includes(f.resp)));
  c.innerHTML = header("Tarefas e solicitações", `<div class="tabs"><button class="tab ${vistaTarefas === "tabela" ? "on" : ""}" data-v="tabela">Tabela</button><button class="tab ${vistaTarefas === "kanban" ? "on" : ""}" data-v="kanban">Kanban</button></div>
    <select class="in" id="fO" style="width:auto"><option value="">Todas as origens</option><option value="escola" ${f.origem === "escola" ? "selected" : ""}>Solicitações das escolas</option><option value="interna" ${f.origem === "interna" ? "selected" : ""}>Internas</option></select>
    <select class="in" id="fR" style="width:auto"><option value="">Todos os responsáveis</option>${S.team.map(n => `<option ${f.resp === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
    ${E ? `<button class="btn" id="btNova">+ Nova tarefa</button>` : ""}`) + `<div id="bd"></div>`;
  $$("[data-v]", c).forEach(b => b.onclick = () => { vistaTarefas = b.dataset.v; pgTarefas(c); });
  $("#fO").onchange = e => { f.origem = e.target.value; pgTarefas(c); }; $("#fR").onchange = e => { f.resp = e.target.value; pgTarefas(c); };
  if ($("#btNova")) $("#btNova").onclick = () => abrirTarefa({}, () => pgTarefas(c));
  const order = Object.keys(ST.tarefa);
  if (vistaTarefas === "kanban"){
    kanban($("#bd"), { rows: fil, dict: ST.tarefa, card: t => `<b>${esc(t.titulo)}</b><div class="small muted">${t.origem === "escola" ? "📩 " : ""}${esc(t._escola)}</div><div class="small">${(t.responsaveis || []).map(esc).join(", ")} ${t.prazo ? `<span style="${t.prazo < today() && t.status !== "concluida" ? "color:var(--bad)" : ""}">· ${fmtDate(t.prazo)}</span>` : ""}</div>`,
      onMove: async (t, st) => { if (!E) return toast("Você tem acesso só para ver as tarefas."); await S.api.update("tarefas", { id: t.id }, { status: st, concluido_em: st === "concluida" ? new Date().toISOString() : null }); pgTarefas(c); atualizarBadges(); },
      onOpen: t => abrirTarefa(t, () => pgTarefas(c)) });
    return;
  }
  new Board($("#bd"), { rows: fil, team: S.team, groupBy: r => r.status, groupOrder: (a, b) => order.indexOf(a) - order.indexOf(b), groupLabel: k => ST.tarefa[k]?.label, groupColor: k => ST.tarefa[k]?.color,
    collapsed: new Set(["concluida"]), searchText: r => r.titulo + " " + r._escola,
    columns: [{ key: "titulo", label: "Tarefa", type: "name", width: 280, sub: r => r.origem === "escola" ? `<span class="tag" style="background:#fff3cf">📩 Solicitação da escola</span>` : "" },
      { key: "_escola", label: "Escola", type: "text", width: 200 }, { key: "verba", label: "Verba", type: "text", width: 110, editable: E },
      { key: "responsaveis", label: "Responsável", type: "people", width: 100, editable: E },
      { key: "status", label: "Status", type: "status", dict: ST.tarefa, width: 120, editable: E },
      { key: "prazo", label: "Prazo", type: "date", width: 100, editable: E },
      { key: "visivel_escola", label: "No portal", type: "check", width: 70, editable: r => E && !!r.escola_id }],
    onOpen: r => abrirTarefa(r, () => pgTarefas(c)),
    onEdit: async (r, k, v) => { const p = { [k]: v }; if (k === "status") p.concluido_em = v === "concluida" ? new Date().toISOString() : null; await S.api.update("tarefas", { id: r.id }, p); if (k === "status") atualizarBadges(); } });
}
async function abrirTarefa(t, done){
  const nova = !t.id; t = { status: "a_fazer", responsaveis: [S.me.nome], visivel_escola: false, ...t };
  const coms = nova ? [] : await S.api.select("comentarios", { eq: { tarefa_id: t.id }, order: ["criado_em"] }).catch(() => []);
  const md = modal(`<h2>${nova ? "Nova tarefa" : "Tarefa"}</h2>
    ${t.origem === "escola" ? `<div class="notice warn small">📩 Solicitação enviada pela escola pelo portal em ${fmtDate(t.criado_em)}.</div>` : ""}
    <div class="field"><label class="f">Título</label><input class="in" id="tt" value="${esc(t.titulo || "")}"></div>
    <div class="field"><label class="f">Descrição</label><textarea class="in" id="td" rows="3">${esc(t.descricao || "")}</textarea></div>
    <div class="grid2"><div class="field"><label class="f">Escola</label><select class="in" id="te"><option value="">FAG / geral</option>${S.escolas.map(e => `<option value="${e.id}" ${e.id === t.escola_id ? "selected" : ""}>${esc(e.nome)}</option>`).join("")}</select></div>
      <div class="field"><label class="f">Verba</label><input class="in" id="tv" list="verbas" value="${esc(t.verba || "")}"><datalist id="verbas">${VERBAS.map(v => `<option>${v}</option>`).join("")}</datalist></div></div>
    <div class="grid3"><div class="field"><label class="f">Status</label><select class="in" id="ts">${Object.entries(ST.tarefa).map(([k, d]) => `<option value="${k}" ${k === t.status ? "selected" : ""}>${d.label}</option>`).join("")}</select></div>
      <div class="field"><label class="f">Prazo</label><input class="in" id="tp" type="date" value="${t.prazo || ""}"></div>
      <div class="field"><label class="f">Responsáveis</label><select class="in" id="tr" multiple size="3">${[...new Set([...S.team, ...(t.responsaveis || [])])].map(n => `<option ${(t.responsaveis || []).includes(n) ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div></div>
    <label style="display:flex;gap:8px;font-size:14px;margin-bottom:10px"><input type="checkbox" id="tvis" ${t.visivel_escola ? "checked" : ""}> Mostrar no portal da escola (vira pendência / conversa com a escola)</label>
    ${(t.arquivos || []).length ? `<div class="small" style="margin-bottom:8px">${t.arquivos.map(a => `<a href="${esc(a.url || "#")}" target="_blank" rel="noopener" data-path="${esc(a.path || "")}">📎 ${esc(a.nome)}</a>`).join(" · ")}</div>` : ""}
    ${!nova ? `<div class="field"><label class="f">Anexar arquivo</label><input type="file" id="tf"></div>` : ""}
    <div style="display:flex;gap:8px;flex-wrap:wrap">${edita("tarefas") ? `<button class="btn" id="ok">Salvar</button>` : `<span class="small muted">Você tem acesso só para ver.</span>`}<button class="btn sec" id="cx">Fechar</button>${!nova && isMaster() ? `<span style="flex:1"></span><button class="btn bad sm" id="del">Excluir</button>` : ""}</div><div class="err" id="er"></div>
    ${!nova ? `<hr style="border:0;border-top:1px solid var(--line);margin:16px 0"><h3>Conversa ${t.visivel_escola || t.origem === "escola" ? "<span class='small muted'>(a escola vê)</span>" : "<span class='small muted'>(interna)</span>"}</h3>
      <div class="thread">${coms.map(k => `<div class="msg ${k.autor_tipo}"><div class="h">${esc(k.autor_nome || (k.autor_tipo === "escola" ? "Escola" : "FAG"))} · ${fmtDate(k.criado_em)}</div>${esc(k.texto)}</div>`).join("") || "<span class='muted small'>Sem mensagens.</span>"}</div>
      ${edita("tarefas") ? `<div style="display:flex;gap:6px"><input class="in" id="cm" placeholder="Escreva uma mensagem…"><button class="btn sm" id="cmOk">Enviar</button></div>` : ""}` : ""}`, { wide: true });
  md.q("#cx").onclick = md.close;
  md.querySelectorAll("[data-path]").forEach(a => { if (a.dataset.path) a.onclick = async ev => { ev.preventDefault(); window.open(await S.api.files.url(a.dataset.path), "_blank"); }; });
  if (md.q("#ok")) md.q("#ok").onclick = async () => {
    const d = { titulo: md.q("#tt").value.trim(), descricao: md.q("#td").value.trim() || null, escola_id: md.q("#te").value || null, verba: md.q("#tv").value.trim() || null,
      status: md.q("#ts").value, prazo: md.q("#tp").value || null, responsaveis: [...md.q("#tr").selectedOptions].map(o => o.value), visivel_escola: md.q("#tvis").checked && !!md.q("#te").value };
    if (d.titulo.length < 3) return md.q("#er").textContent = "Informe o título.";
    if (d.status === "concluida" && t.status !== "concluida") d.concluido_em = new Date().toISOString();
    try {
      let id = t.id;
      if (nova){ d.criado_por = S.me.nome; d.origem = "interna"; id = (await S.api.insert("tarefas", d))[0].id; } else await S.api.update("tarefas", { id }, d);
      const file = md.q("#tf")?.files?.[0];
      if (file){ const path = `${d.escola_id || "geral"}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, "_")}`; await S.api.files.upload(path, file);
        await S.api.update("tarefas", { id }, { arquivos: [...(t.arquivos || []), { nome: file.name, path }] }); }
      md.close(); toast("Tarefa salva"); atualizarBadges(); done?.();
    } catch (err){ md.q("#er").textContent = err.message; }
  };
  md.q("#del")?.addEventListener("click", async () => { if (!confirm("Excluir esta tarefa?")) return; await S.api.remove("tarefas", { id: t.id }); md.close(); done?.(); });
  md.q("#cmOk")?.addEventListener("click", async () => { const tx = md.q("#cm").value.trim(); if (!tx) return;
    await S.api.insert("comentarios", { tarefa_id: t.id, autor_tipo: "fag", autor_nome: S.me.nome, texto: tx }); md.close(); abrirTarefa(t, done); });
}

/* =============== EQUIPE (só gestor geral) =============== */
const MODULOS = [["escolas","Escolas"],["acessos","Acessos SIG / Web"],["contratos","Renovação"],["mensalidades","Mensalidades"],["prestacoes","Prestações"],["contabil","Contábil"],["atas","ATA"],["tarefas","Tarefas"]];
const PRESET = {
  lider: Object.fromEntries(MODULOS.map(([k]) => [k, "editar"])),
  assistente: Object.fromEntries(MODULOS.map(([k]) => [k, "editar"])),
  colaborador: Object.fromEntries(MODULOS.map(([k]) => [k, "ver"])),
};
async function pgEquipe(c){
  const ps = await S.api.select("perfis", { order: ["nome"] });
  const NIV = [["", "—", "#e9e4d2"], ["ver", "Ver", "#66c8f0"], ["editar", "Editar", "#63b231"]];
  c.innerHTML = header("Equipe") + `<div class="notice info small">Cada pessoa cria o próprio acesso em <b>Primeiro acesso</b> (só e-mails @fagcontabilidade.com.br). Aqui você libera, escolhe o <b>papel</b> e personaliza o que cada um <b>vê</b> ou pode <b>editar</b> em cada módulo.
      Ao trocar o papel, as permissões voltam ao padrão dele (Líder e Assistente: editar tudo · Colaborador: só ver) e depois podem ser ajustadas uma a uma.
      O valor do ano anterior e a aprovação de propostas continuam só com o gestor geral.</div>
    <div class="card" style="padding:0;overflow:auto"><table class="bd"><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Ativo</th>${MODULOS.map(([, l]) => `<th class="c">${l}</th>`).join("")}</tr></thead><tbody>
    ${ps.map(p => { const pm = p.permissoes || {}; const eu = p.id === S.me.id;
      return `<tr data-id="${p.id}"><td><input class="in cell-in" data-k="nome" value="${esc(p.nome)}"></td><td class="small">${esc(p.email)}</td>
      <td><select class="in cell-in" data-k="papel" ${eu ? "disabled" : ""}>${["master","lider","assistente","colaborador"].map(x => `<option value="${x}" ${(p.papel === x || (p.papel === "gestor" && x === "lider")) ? "selected" : ""}>${PAPEIS[x]}</option>`).join("")}</select></td>
      <td class="c"><input type="checkbox" data-k="ativo" ${p.ativo ? "checked" : ""} ${eu ? "disabled" : ""}></td>
      ${MODULOS.map(([k]) => p.papel === "master" ? `<td class="c small muted">Editar</td>` : `<td class="c"><select class="in cell-in" data-m="${k}" style="min-width:90px">${NIV.map(([v, l]) => `<option value="${v}" ${(pm[k] || "") === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>`).join("")}</tr>`; }).join("")}
    </tbody></table></div>`;
  $$("tr[data-id]", c).forEach(tr => {
    const id = tr.dataset.id; const p = ps.find(x => x.id === id);
    const save = async patch => { try { await S.api.update("perfis", { id }, patch); Object.assign(p, patch); toast("Salvo"); } catch (e){ toast("Erro: " + e.message); } };
    tr.querySelector("[data-k=nome]").onchange = e => save({ nome: e.target.value.trim() });
    tr.querySelector("[data-k=papel]").onchange = async e => { const papel = e.target.value;
      await save(papel === "master" ? { papel } : { papel, permissoes: { ...PRESET[papel] } }); pgEquipe(c); };
    tr.querySelector("[data-k=ativo]").onchange = e => save({ ativo: e.target.checked });
    const paint = sl => { const n = NIV.find(x => x[0] === sl.value); sl.style.background = n[2]; sl.style.color = sl.value ? "#fff" : "#555"; sl.style.fontWeight = 600; };
    $$("[data-m]", tr).forEach(sl => { paint(sl); sl.onchange = () => { paint(sl); const pm = { ...(p.permissoes || {}) }; if (sl.value) pm[sl.dataset.m] = sl.value; else delete pm[sl.dataset.m]; save({ permissoes: pm }); }; });
  });
}

/* =============== CONFIGURAÇÕES (só gestor geral) =============== */
async function pgConfig(c){
  const cfg = S.cfg;
  const aud = await S.api.select("auditoria", { order: ["quando", "desc"] }).catch(() => []);
  const pn = Object.fromEntries((S.perfis || []).map(p => [p.id, p.nome]));
  c.innerHTML = header("Configurações") + `
    <div class="card"><h2>Campanha de renovação</h2><div class="grid4">
      <div class="field"><label class="f">Ano do contrato</label><input class="in" id="cAno" type="number" value="${cfg.ano}"></div>
      <div class="field"><label class="f">Recálculo de guias (R$/mês)</label><input class="in" id="cGuia" type="number" step="0.01" value="${cfg.valorGuia}"></div>
      <div class="field"><label class="f">Vigência</label><input class="in" id="cVig" value="${esc(cfg.vigencia)}"></div>
      <div class="field"><label class="f">Recebendo propostas</label><select class="in" id="cAb"><option value="1">Sim</option><option value="0" ${cfg.aberto ? "" : "selected"}>Não (prazo encerrado)</option></select></div></div>
      <button class="btn" id="svCfg">Salvar</button></div>
    <div class="card"><h2>Importar do monday</h2><p class="small muted">Lê os quadros da pasta <b>Escolas</b> no monday e atualiza o CRM. <b>Nada é alterado ou apagado no monday.</b> Pode repetir quantas vezes quiser até janeiro: os registros são atualizados, não duplicados. A renovação do ano da campanha não é sobrescrita.</p>
      <button class="btn" id="btMon">Abrir importador</button></div>
    <div class="card"><h2>Registro de acessos sensíveis</h2><ul class="list">${aud.slice(0, 50).map(a => `<li><span>${esc(pn[a.quem] || "?")} · ${esc(a.acao)} ${a.registro && S.esc[a.registro] ? "· " + esc(S.esc[a.registro].nome) : ""}</span><span class="small muted">${fmtDate(a.quando)}</span></li>`).join("") || "<li class='muted'>Nada registrado.</li>"}</ul></div>`;
  $("#svCfg").onclick = async () => { const v = { ano: +$("#cAno").value, valorGuia: r2(+$("#cGuia").value), vigencia: $("#cVig").value.trim(), aberto: $("#cAb").value === "1" };
    await S.api.upsert("config", [{ chave: "campanha", valor: v }], "chave"); S.cfg = v; toast("Configuração salva"); };
  $("#btMon").onclick = () => abrirImportador(S, async () => { setEscolas(await S.api.select("escolas", { order: ["nome"] })); });
}
