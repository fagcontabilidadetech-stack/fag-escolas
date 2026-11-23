// ===================== Portal da escola (acesso só pela chave) =====================
import { getApi } from "./api.js";
import { $, $$, esc, r2, brl, fmtDate, fmtCpf, cpfOk, onlyDig, emailOk, normKey, fmtKey, toast, compLabel, ST, chip, VERBAS } from "./util.js";

const P = { api: null, key: null, d: null, tab: "renovacao", sel: { ata: false, scan: false, guia: false }, staff: null };
const SERV = {
  ata:  { nome: "Alteração de ATAs, Estatuto e DBE", desc: "1 mensalidade dividida por 12 meses", grupos: ["A","B"] },
  scan: { nome: "Notas escaneadas/digitalizadas para o Sistema SEI", desc: "1 mensalidade dividida por 12 meses", grupos: ["B"] },
  guia: { nome: "Recálculo de guias e TFE não pagas pela APM", desc: "Valor fixo mensal", grupos: ["A","B"] },
};
const ERROS = { CHAVE_INVALIDA: "Chave não encontrada. Confira se digitou corretamente.", PRAZO_ENCERRADO: "O prazo para envio está encerrado. Fale com a FAG.",
  PROPOSTA_FECHADA: "Esta proposta já foi analisada pela FAG.", CPF_INVALIDO: "CPF inválido.", LIMITE_DIARIO: "Limite de solicitações do dia atingido.", SEM_PROPOSTA: "Ainda não há proposta para a sua escola." };
const msgErro = e => { const k = Object.keys(ERROS).find(x => String(e.message).includes(x)); return k ? ERROS[k] : "Não foi possível concluir agora. Tente novamente em instantes."; };

(async () => {
  P.api = await getApi();
  if (P.api.demo){ $("#demoBanner").classList.remove("hidden"); P.api.seedDemo(); }
  // se for alguém da FAG logado no CRM (mesmo navegador), registra quem preencheu
  P.api.auth.onChange(u => { P.staff = u && u.ativo ? u : null; });
  const k = new URLSearchParams(location.search).get("k");
  if (k){ $("#inKey").value = fmtKey(normKey(k)); acessar(); }
})();
$("#inKey").addEventListener("input", e => { const v = normKey(e.target.value).slice(0, 8); e.target.value = v.length > 4 ? v.slice(0, 4) + "-" + v.slice(4) : v; });
$("#inKey").addEventListener("keydown", e => { if (e.key === "Enter") acessar(); });
$("#btKey").onclick = acessar;
$("#lnkSair").onclick = e => { e.preventDefault(); history.replaceState(null, "", location.pathname); location.reload(); };

async function acessar(){
  const k = normKey($("#inKey").value); $("#keyErr").textContent = "";
  if (k.length !== 8) return $("#keyErr").textContent = "A chave tem 8 caracteres.";
  $("#btKey").disabled = true;
  try { P.key = k; await carregar(); $("#stepKey").classList.add("hidden"); $("#stepApp").classList.remove("hidden"); }
  catch (e){ $("#keyErr").textContent = msgErro(e); }
  finally { $("#btKey").disabled = false; }
}
async function carregar(){
  P.d = await P.api.rpc("portal_dados", { p_chave: P.key });
  const p = P.d.proposta; if (p) P.sel = { ata: !!p.ata, scan: !!p.scan, guia: !!p.guia };
  $("#sNome").textContent = P.d.escola.nome; $("#sCnpj").textContent = "CNPJ " + P.d.escola.cnpj;
  if (!p && P.tab === "renovacao") P.tab = "mensalidades";
  render();
}
function render(){
  const d = P.d;
  const abertas = d.solicitacoes.filter(s => s.status !== "concluida").length;
  const tabs = [d.proposta && ["renovacao", `Renovação ${d.campanha.ano}`, d.proposta.status === "pendente" || d.proposta.status === "ajuste" ? "!" : ""],
    ["mensalidades", "Mensalidades", d.mensalidades.length || ""], ["pendencias", "Pendências", d.pendencias.length || ""], ["solicitacoes", "Solicitações", abertas || ""]].filter(Boolean);
  $("#ptabs").innerHTML = tabs.map(([k, l, b]) => `<button class="ptab ${k === P.tab ? "on" : ""}" data-t="${k}">${l}${b !== "" ? `<span class="bd">${b}</span>` : ""}</button>`).join("");
  $$(".ptab").forEach(b => b.onclick = () => { P.tab = b.dataset.t; render(); });
  ({ renovacao: tRenovacao, mensalidades: tMensalidades, pendencias: tPendencias, solicitacoes: tSolicitacoes })[P.tab]($("#pBody"));
}

/* ---------- Renovação ---------- */
function calc(base, grupo){ const m = r2(base / 12); const g = r2(P.d.campanha.valorGuia);
  const ad = r2((P.sel.ata ? m : 0) + (grupo === "B" && P.sel.scan ? m : 0) + (P.sel.guia ? g : 0)); return { m, g, total: r2(base + ad) }; }
function tRenovacao(el){
  const p = P.d.proposta, cfg = P.d.campanha, g = P.d.escola.grupo, st = p.status;
  const locked = st === "aprovada" || st === "recusada" || (st === "pendente" && cfg.aberto === false);
  const c = calc(+p.mensalidade, g);
  let msg = "";
  if (st === "enviada") msg = `<div class="notice warn"><b>Proposta enviada em ${fmtDate(p.enviadaEm)}</b> e aguardando aprovação da FAG. Você ainda pode alterar e reenviar.</div>`;
  else if (st === "ajuste") msg = `<div class="notice warn"><b>A FAG pediu um ajuste:</b><br>${esc(p.obsFag || "")}</div>`;
  else if (st === "aprovada") msg = `<div class="notice ok"><b>Proposta aprovada!</b> A FAG vai enviar o contrato para assinatura.</div>`;
  else if (st === "recusada") msg = `<div class="notice bad"><b>Proposta não aprovada.</b> ${esc(p.obsFag || "")} Fale com a FAG.</div>`;
  else if (cfg.aberto === false) msg = `<div class="notice bad">O prazo para envio está encerrado. Fale com a FAG.</div>`;
  const svs = Object.keys(SERV).filter(k => SERV[k].grupos.includes(g));
  el.innerHTML = `<div class="card">${msg}
      <div class="valbox y"><div class="t">Valor da sua mensalidade ${cfg.ano}<br>antes da personalização</div><div class="v">${brl(p.mensalidade)}</div></div>
      <div class="pkg-title">Pacote Plus Personalizado</div>
      <p class="small muted" style="margin:0 0 10px">Escolha os serviços que deseja incluir. Cada serviço é somado à mensalidade.</p>
      ${svs.map(k => `<div class="svc ${P.sel[k] ? "on" : ""}" data-k="${k}" role="switch" aria-checked="${!!P.sel[k]}" tabindex="0" style="${locked ? "cursor:default" : ""}">
        <div class="nm">${SERV[k].nome}<small>${SERV[k].desc}</small></div><div class="pr">+ ${brl(k === "guia" ? c.g : c.m)}</div><div class="switch"></div></div>`).join("")}
      <div class="valbox b"><div class="t">Valor da sua mensalidade ${cfg.ano}<br>com personalização</div><div class="v">${brl(c.total)}</div></div></div>
    <div class="card"><h2>Responsável pela APM</h2>
      <div class="grid2"><div class="field"><label class="f">Nome completo *</label><input class="in" id="fNome" maxlength="110" value="${esc(p.respNome || "")}"></div>
        <div class="field"><label class="f">CPF *</label><input class="in" id="fCpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" value="${esc(p.respCpf || "")}"></div></div>
      <div class="grid2"><div class="field"><label class="f">Cargo na APM</label><input class="in" id="fCargo" maxlength="60" placeholder="Ex.: Presidente da Diretoria Executiva" value="${esc(p.respCargo || "")}"></div>
        <div class="field"><label class="f">Telefone / WhatsApp *</label><input class="in" id="fTel" maxlength="20" placeholder="(11) 90000-0000" value="${esc(p.telefone || "")}"></div></div>
      <div class="field"><label class="f">E-mail *</label><input class="in" id="fEmail" type="email" maxlength="120" value="${esc(p.email || "")}"></div>
      <div class="field"><label class="f">Observações (opcional)</label><textarea class="in" id="fObs" rows="2" maxlength="500">${esc(p.obsEscola || "")}</textarea></div>
      ${locked ? "" : `<label class="check"><input type="checkbox" id="fAceite"><span>Declaro que sou responsável pela APM e concordo com os valores acima para o contrato de ${cfg.ano}. Sei que a proposta ainda passa pela aprovação da FAG.</span></label>
      <button class="btn big ok" id="btEnviar">${st === "pendente" ? "Enviar proposta" : "Reenviar proposta"}</button>`}
      <div class="err" id="fErr"></div></div>`;
  if (locked) $$("input,textarea", el).forEach(i => i.disabled = true);
  $$(".svc", el).forEach(s => { const tog = () => { if (locked) return; P.sel[s.dataset.k] = !P.sel[s.dataset.k]; savedForm(); render(); restoreForm(); };
    s.onclick = tog; s.onkeydown = e => { if (e.key === " " || e.key === "Enter"){ e.preventDefault(); tog(); } }; });
  $("#fCpf").oninput = e => e.target.value = fmtCpf(e.target.value);
  $("#btEnviar")?.addEventListener("click", enviar);
}
let _form = null;
function savedForm(){ _form = Object.fromEntries(["fNome","fCpf","fCargo","fTel","fEmail","fObs"].map(id => [id, $("#" + id)?.value])); _form.ac = $("#fAceite")?.checked; }
function restoreForm(){ if (!_form) return; for (const [id, v] of Object.entries(_form)) if (id !== "ac" && $("#" + id)) $("#" + id).value = v; if ($("#fAceite")) $("#fAceite").checked = _form.ac; _form = null; }
async function enviar(){
  const f = { nome: $("#fNome").value.trim(), cpf: $("#fCpf").value, cargo: $("#fCargo").value.trim(), tel: $("#fTel").value.trim(), email: $("#fEmail").value.trim(), obs: $("#fObs").value.trim() };
  const errs = [];
  if (f.nome.length < 5 || !f.nome.includes(" ")) errs.push("Informe o nome completo do responsável.");
  if (!cpfOk(f.cpf)) errs.push("CPF inválido."); if (onlyDig(f.tel).length < 10) errs.push("Informe um telefone com DDD.");
  if (!emailOk(f.email)) errs.push("E-mail inválido."); if (!$("#fAceite").checked) errs.push("Marque a declaração de concordância.");
  $("#fErr").innerHTML = errs.join("<br>"); if (errs.length) return;
  $("#btEnviar").disabled = true;
  try {
    await P.api.rpc("portal_enviar_proposta", { p_chave: P.key, p: { ata: P.sel.ata, scan: P.sel.scan, guia: P.sel.guia, respNome: f.nome, respCpf: fmtCpf(f.cpf), respCargo: f.cargo,
      telefone: f.tel, email: f.email, obsEscola: f.obs, aceite: true, enviadaPor: P.staff ? "FAG: " + P.staff.nome : "escola" } });
    await carregar(); scrollTo({ top: 0, behavior: "smooth" }); toast("Proposta enviada!");
  } catch (e){ $("#fErr").textContent = msgErro(e); $("#btEnviar").disabled = false; }
}

/* ---------- Mensalidades em aberto ---------- */
function tMensalidades(el){
  const ms = P.d.mensalidades; const tot = ms.reduce((a, m) => a + (+m.valor || 0), 0);
  el.innerHTML = `<div class="card"><h2>Mensalidades em aberto</h2>
    ${ms.length ? `<ul class="list">${ms.map(m => `<li><span><b>${compLabel(m.competencia)}</b></span><span>${chip(ST.mensalidade, m.status)} &nbsp;<b>${brl(m.valor)}</b></span></li>`).join("")}</ul>
      <div class="valbox y"><div class="t">Total em aberto</div><div class="v">${brl(tot)}</div></div>
      <p class="small muted">Já pagou? Envie o comprovante em <b>Solicitações</b> que a FAG dá baixa.</p>`
      : `<div class="notice ok">Tudo em dia! Nenhuma mensalidade em aberto. 🎉</div>`}</div>`;
}

/* ---------- Pendências (o que a FAG precisa da escola) ---------- */
function tPendencias(el){
  const ps = P.d.pendencias;
  el.innerHTML = `<div class="card"><h2>O que a FAG precisa da sua escola</h2>
    ${ps.length ? ps.map(p => `<div class="card" style="margin:10px 0;padding:14px"><div style="display:flex;justify-content:space-between;gap:10px"><b>${esc(p.titulo)}</b>${p.prazo ? `<span class="small">Prazo: <b>${fmtDate(p.prazo)}</b></span>` : ""}</div>
      ${p.descricao ? `<div class="small" style="margin-top:4px">${esc(p.descricao)}</div>` : ""}<button class="btn sm sec" style="margin-top:8px" data-resp="${p.id}">Responder</button></div>`).join("")
      : `<div class="notice ok">Nenhuma pendência no momento.</div>`}</div>`;
  $$("[data-resp]", el).forEach(b => b.onclick = () => { P.tab = "solicitacoes"; P.abrir = b.dataset.resp; render(); });
}

/* ---------- Solicitações (chamados da escola + conversa) ---------- */
function tSolicitacoes(el){
  const ss = P.d.solicitacoes;
  el.innerHTML = `<div class="card"><h2>Nova solicitação</h2>
      <div class="field"><label class="f">Assunto *</label><input class="in" id="nT" maxlength="150" placeholder="Ex.: 2ª via de boleto, dúvida sobre prestação…"></div>
      <div class="grid2"><div class="field"><label class="f">Verba relacionada</label><select class="in" id="nV"><option value="">—</option>${VERBAS.map(v => `<option>${v}</option>`).join("")}</select></div><div></div></div>
      <div class="field"><label class="f">Descreva</label><textarea class="in" id="nD" rows="3" maxlength="2000"></textarea></div>
      <button class="btn" id="nOk">Enviar solicitação</button><div class="err" id="nErr"></div></div>
    <div class="card"><h2>Suas solicitações</h2>
      ${ss.map(s => `<details class="card" style="margin:8px 0;padding:12px 14px" ${P.abrir === s.id ? "open" : ""}><summary style="cursor:pointer;display:flex;justify-content:space-between;gap:10px"><b>${esc(s.titulo)}</b>${chip(ST.tarefa, s.status, { cls: "mini" })}</summary>
        ${s.descricao ? `<div class="small" style="margin-top:6px">${esc(s.descricao)}</div>` : ""}
        <div class="thread">${s.comentarios.map(k => `<div class="msg ${k.autor}"><div class="h">${k.autor === "fag" ? "FAG" : "Escola"} · ${fmtDate(k.em)}</div>${esc(k.texto)}</div>`).join("")}</div>
        ${s.status !== "concluida" ? `<div style="display:flex;gap:6px"><input class="in" data-c="${s.id}" placeholder="Escreva uma mensagem…"><button class="btn sm" data-cs="${s.id}">Enviar</button></div>` : `<div class="small muted">Concluída.</div>`}</details>`).join("")
        || `<p class="muted">Nenhuma solicitação ainda.</p>`}</div>`;
  P.abrir = null;
  $("#nOk").onclick = async () => { const t = $("#nT").value.trim(); if (t.length < 3) return $("#nErr").textContent = "Informe o assunto.";
    try { await P.api.rpc("portal_nova_solicitacao", { p_chave: P.key, p_titulo: t, p_descricao: $("#nD").value.trim(), p_verba: $("#nV").value }); toast("Solicitação enviada!"); await carregar(); }
    catch (e){ $("#nErr").textContent = msgErro(e); } };
  $$("[data-cs]", el).forEach(b => b.onclick = async () => { const i = $(`[data-c="${b.dataset.cs}"]`, el); if (!i.value.trim()) return;
    try { await P.api.rpc("portal_comentar", { p_chave: P.key, p_tarefa: b.dataset.cs, p_texto: i.value.trim() }); P.abrir = b.dataset.cs; await carregar(); } catch (e){ toast(msgErro(e)); } });
}
