// ===================== utilidades compartilhadas =====================
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const brl = n => (n == null || n === "") ? "–" : "R$ " + Number(n).toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
export const onlyDig = s => String(s || "").replace(/\D/g, "");
export const fmtCpf = s => { const d = onlyDig(s).slice(0,11); return d.replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2"); };
export function cpfOk(c){ c = onlyDig(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (let t = 9; t < 11; t++){ let s = 0; for (let i = 0; i < t; i++) s += +c[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +c[t]) return false; } return true; }
export const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const normKey = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const fmtKey = k => k && k.length === 8 ? k.slice(0,4) + "-" + k.slice(4) : (k || "");
const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newKey(){ const a = new Uint32Array(8); crypto.getRandomValues(a); return [...a].map(x => ALPH[x % ALPH.length]).join(""); }
export function fmtDate(v){ if (!v) return ""; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y,m,d] = v.split("-"); return `${d}/${m}/${y}`; }
  const d = new Date(v); return isNaN(d) ? "" : d.toLocaleString("pt-BR", {dateStyle:"short", timeStyle:"short"}); }
export const MESES = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
export const MESES_LONGOS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
export const compLabel = c => { if (!c) return ""; const [y, m] = c.split("-"); return `${MESES_LONGOS[+m - 1]}/${y}`; };
export const today = () => new Date().toISOString().slice(0, 10);
export const noAcc = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

export function toast(msg){ let t = $("#toast"); if (!t){ t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.append(t); }
  t.textContent = msg; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2800); }

export function modal(html, { wide = false } = {}){
  const root = document.createElement("div");
  root.innerHTML = `<div class="modal-bg"><div class="modal" style="${wide ? "max-width:900px" : ""}">${html}</div></div>`;
  document.body.append(root);
  const close = () => root.remove();
  root.firstChild.addEventListener("mousedown", e => { if (e.target === root.firstChild) close(); });
  root.close = close; root.q = s => root.querySelector(s); return root;
}

/* ---------------- rótulos e cores (iguais aos do monday) ---------------- */
const L = (pairs) => Object.fromEntries(pairs.map(([k, label, color]) => [k, { label, color }]));
export const ST = {
  mensalidade: L([["a_receber","A receber","#fdab3d"],["pago","Pago","#00c875"],["em_atraso","Em atraso","#df2f4a"],
                  ["cobrado","Cobrado","#ff5ac4"],["sem_verba","Sem verba","#a9a9a9"],["vacancia","Vacância","#7f5347"]]),
  contrato: L([["elaboracao","Elaboração","#a9a9a9"],["aceito","Aceito","#007eb5"],["assinado_fag","Assinado FAG","#00c875"],
               ["assinada_apm","Assinada APM","#037f4c"],["recusado","Recusado","#df2f4a"],["sem_retorno","Sem retorno","#401694"]]),
  proposta: L([["pendente","Não respondeu","#a9a9a9"],["enviada","Aguardando aprovação","#fdab3d"],["ajuste","Ajuste solicitado","#f46e16"],
               ["aprovada","Aprovada","#00c875"],["recusada","Recusada","#df2f4a"]]),
  tarefa: L([["a_fazer","A fazer","#a9a9a9"],["em_andamento","Em andamento","#fdab3d"],["pendente","Pendente","#df2f4a"],
             ["revisar","Revisar","#401694"],["concluida","Concluída","#00c875"]]),
  prestacao: L([["Não iniciado","Não iniciado","#a9a9a9"],["Em andamento","Em andamento","#fdab3d"],["Prévia entregue","Prévia entregue","#9cd326"],
                ["Entregue","Entregue","#00c875"],["Parado","Parado","#df2f4a"],["Com erro","Com erro","#ff5ac4"],["Não tem","Não tem","#333333"]]),
  mes: L([["Feito","Feito","#00c875"],["Falta arquivo","Falta arquivo","#b8b8b8"],["Lançado c/ pendência","Lançado c/ pendência","#007eb5"],
          ["Em andamento","Em andamento","#fdab3d"],["Parado","Parado","#df2f4a"]]),
  balancete: L([["Lançado","Lançado","#00c875"],["Em andamento","Em andamento","#fdab3d"],["Diferença","Diferença","#df2f4a"],
                ["S/Demonstrativo","S/Demonstrativo","#401694"],["Não fazer","Não fazer","#9d50dd"],["Não iniciado","Não iniciado","#a9a9a9"],["Não tem","Não tem","#333333"]]),
  obrigacao: L([["Entregue","Entregue","#00c875"],["Em andamento","Em andamento","#fdab3d"],["Parado","Parado","#df2f4a"],
                ["Pendente","Pendente","#9d50dd"],["Ex-cliente","Ex-cliente","#007eb5"],["Não entrega","Não entrega","#a9a9a9"]]),
  ataArquivo: L([["Verificar","Verificar","#fdab3d"],["Pronto","Pronto","#00c875"],["Parado para correção","Parado para correção","#df2f4a"],["Não recebido","Não recebido","#a9a9a9"]]),
  ataDocs: L([["Feito","Feito","#00c875"],["Não feito","Não feito","#a9a9a9"]]),
  ataPag: L([["Recursos próprios","Recursos próprios","#fdab3d"],["Escola","Escola","#00c875"],["FAG","FAG","#df2f4a"]]),
  quem: L([["FAG","FAG","#3560b5"],["ESCOLA","ESCOLA","#63b231"],["FAG/ESCOLA","FAG/ESCOLA","#f46e16"]]),
  grupo: L([["A","A","#ef3a20"],["B","B","#3560b5"]]),
};
export const VERBAS = ["PTRF","PDDE Básico","PDDE Qualidade","PDDE Estrutura","PDDE Equidade","PDDE + Edu","PDDE Conectada","Outros"];
export const FORMAS = ["Cartão","Transf.","Boleto","Cheque"];

// converte um rótulo vindo do monday para o rótulo padrão (ignora acentos/maiúsculas)
const SINONIMOS = { "cagado":"Com erro", "nao fiz-cagado":"Pendente", "nao fiz cagado":"Pendente", "feito":"Entregue", "andamento":"Em andamento",
  "a receber!":"a_receber", "lancado c/ pendencia":"Lançado c/ pendência" };
export function canon(dict, label, { feitoVira } = {}){
  if (label == null || label === "") return null;
  const k = noAcc(label).toLowerCase().trim();
  for (const [code, v] of Object.entries(dict)) if (noAcc(v.label).toLowerCase() === k || noAcc(code).toLowerCase() === k) return code;
  if (k === "feito" && feitoVira) return feitoVira;
  const s = SINONIMOS[k]; if (s && dict[s]) return s;
  return label; // mantém o rótulo original se não reconhecer
}
export function chip(dict, value, { cls = "" } = {}){
  if (value == null || value === "") return `<span class="chip ${cls}" style="background:#e9e4d2;color:#8a8470">–</span>`;
  const d = dict[value] || { label: value, color: "#8a8470" };
  return `<span class="chip ${cls}" style="background:${d.color}">${esc(d.label)}</span>`;
}

/* ---------------- correspondência de nomes de escola (monday → CRM) ---------------- */
const STOP = new Set("PROF PROFA PROFESSOR PROFESSORA VER VEREADOR DR DRA DO DA DE DOS DAS E JD JARDIM CEU APMSUAC SUAC CEI EMEI EMEF CEMEI CAP PM ENG ENGENHEIRO PRES PRESIDENTE JR JUNIOR COBRAR DIA XX A AP S F C N R B V T L".split(" "));
export const normName = s => noAcc(s).toUpperCase().replace(/\s+-\s+COBRAR.*$/, "").replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
const tipoEscola = t => ["CEMEI","EMEF","EMEI","CEI","SUAC","APMSUAC"].find(k => t.includes(k))?.replace("APMSUAC", "SUAC") || null;
function sim(a, b){ // similaridade simples entre palavras (Dice de bigramas)
  if (a === b) return 1; if (a.length < 2 || b.length < 2) return 0;
  const bg = w => { const m = new Map(); for (let i = 0; i < w.length - 1; i++){ const x = w.slice(i, i + 2); m.set(x, (m.get(x) || 0) + 1); } return m; };
  const A = bg(a), B = bg(b); let inter = 0; for (const [k, v] of A) inter += Math.min(v, B.get(k) || 0);
  return 2 * inter / (a.length - 1 + b.length - 1);
}
export function makeMatcher(escolas){
  const cands = escolas.flatMap(e => [e.nome, ...(e.aliases || [])].map(n => { const t = normName(n); return { e, t, ty: tipoEscola(t), k: t.filter(w => !STOP.has(w)), full: t.join(" ") }; }));
  const exact = new Map(cands.map(c => [c.full, c.e]));
  return function match(name){
    const t = normName(name); if (!t.length) return null;
    const full = t.join(" "); if (exact.has(full)) return { escola: exact.get(full), score: 1 };
    const ty = tipoEscola(t), k = t.filter(w => !STOP.has(w)); if (!k.length) return null;
    let best = null, second = 0;
    for (const c of cands){
      if (ty && c.ty && ty !== c.ty) continue;
      let sc = 0, hits = 0; for (const w of k){ const m = Math.max(0, ...c.k.map(w2 => w === w2 ? 1 : (w2.startsWith(w) || w.startsWith(w2)) ? (Math.min(w.length, w2.length) >= 4 ? .95 : 0) : sim(w, w2))); if (m > .78){ sc += m; hits++; } }
      if (hits < Math.min(2, k.length, c.k.length)) continue;
      sc /= Math.max(1, Math.min(k.length, c.k.length)); if (t.includes("CEU") !== c.t.includes("CEU")) sc -= .1;
      if (!best || sc > best.score){ if (best && best.escola !== c.e) second = Math.max(second, best.score); best = { escola: c.e, score: sc }; }
      else if (c.e !== best.escola) second = Math.max(second, sc);
    }
    if (!best || best.score < .72 || best.score - second < .08) return null;
    return best;
  };
}
