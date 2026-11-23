// ===================== camada de dados =====================
// Usa o Supabase quando config.js tem URL e chave; senão roda em MODO DEMONSTRAÇÃO (dados só no navegador).
import { CONFIG } from "../config.js";
import { r2 } from "./util.js";

const PAGE = 1000;

/* ---------------- Supabase ---------------- */
async function supabaseApi(){
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });
  const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const applyF = (q, f = {}) => {
    for (const [k, v] of Object.entries(f.eq || {})) q = q.eq(k, v);
    for (const [k, v] of Object.entries(f.in || {})) q = q.in(k, v);
    for (const [k, v] of Object.entries(f.gte || {})) q = q.gte(k, v);
    for (const [k, v] of Object.entries(f.lte || {})) q = q.lte(k, v);
    if (f.order) q = q.order(f.order[0], { ascending: f.order[1] !== "desc" });
    return q;
  };
  let perfil = null;
  const api = {
    demo: false, sb,
    async select(t, f = {}){
      let out = [], from = 0;
      for (;;){ const d = chk(await applyF(sb.from(t).select(f.cols || "*"), f).range(from, from + PAGE - 1)); out = out.concat(d); if (d.length < PAGE) break; from += PAGE; }
      return out;
    },
    async insert(t, rows){ fresh(); return chk(await sb.from(t).insert(rows).select()); },
    async update(t, match, patch){ fresh(); let q = sb.from(t).update(patch); for (const [k, v] of Object.entries(match)) q = q.eq(k, v); return chk(await q.select()); },
    async upsert(t, rows, onConflict, { ignoreDuplicates = false } = {}){
      let out = []; for (let i = 0; i < rows.length; i += 500) out = out.concat(chk(await sb.from(t).upsert(rows.slice(i, i + 500), { onConflict, ignoreDuplicates }).select()));
      return out; },
    async remove(t, match){ fresh(); let q = sb.from(t).delete(); for (const [k, v] of Object.entries(match)) q = q.eq(k, v); return chk(await q); },
    async rpc(fn, args){ return chk(await sb.rpc(fn, args)); },
    auth: {
      async login(email, pin){ chk(await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pin })); },
      async signup(nome, email, pin){ chk(await sb.auth.signUp({ email: email.trim().toLowerCase(), password: pin, options: { data: { nome }, emailRedirectTo: location.origin + location.pathname } })); },
      async logout(){ await sb.auth.signOut(); },
      async resetPin(email){ chk(await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: location.origin + location.pathname + "#novo-pin" })); },
      async setPin(pin){ chk(await sb.auth.updateUser({ password: pin })); },
      onChange(cb){
        const load = async (session, ev) => {
          if (!session){ perfil = null; return cb(null, ev); }
          const { data } = await sb.from("perfis").select("*").eq("id", session.user.id).maybeSingle();
          perfil = data; cb(data || { id: session.user.id, email: session.user.email, ativo: false }, ev);
        };
        sb.auth.getSession().then(({ data }) => load(data.session, "INITIAL"));
        sb.auth.onAuthStateChange((ev, session) => { if (ev !== "INITIAL_SESSION" && ev !== "TOKEN_REFRESHED") setTimeout(() => load(session, ev)); });
      },
    },
    files: {
      async upload(path, file){ chk(await sb.storage.from("arquivos").upload(path, file, { upsert: false })); return path; },
      async url(path){ return chk(await sb.storage.from("arquivos").createSignedUrl(path, 600)).signedUrl; },
    },
  };
  return api;
}

/* ---------------- Demonstração (localStorage) ---------------- */
const UNIQUE = { escolas: ["cnpj"], contratos: ["escola_id","ano"], mensalidades: ["escola_id","competencia"], prestacoes: ["escola_id","ano","programa","referencia"],
  balancetes: ["escola_id","ano"], atas: ["escola_id","ano"], contratos_privado: ["contrato_id"], escolas_acessos: ["escola_id"], tarefas: ["monday_id"], config: ["chave"] };
const PK = { contratos_privado: "contrato_id", escolas_acessos: "escola_id", config: "chave" };
function demoApi(){
  const K = "fag_crm_demo_v1";
  let db; try { db = JSON.parse(localStorage.getItem(K)) || {}; } catch { db = {}; }
  const save = () => { try { localStorage.setItem(K, JSON.stringify(db)); } catch {} };
  const fresh = () => { try { db = JSON.parse(localStorage.getItem(K)) || db; } catch {} };  // outra aba (ex.: portal) pode ter gravado
  const T = t => (db[t] ??= []);
  if (!T("config").length) T("config").push({ chave: "campanha", valor: { ano: 2027, valorGuia: 6, vigencia: "01/01/2027 a 31/12/2027", aberto: true } });
  const now = () => new Date().toISOString();
  const defaults = { escolas: { situacao: "ativa", aliases: [], responsaveis: [] }, contratos: { status: "elaboracao", proposta_status: "pendente", ata: false, scan: false, guia: false, arquivos: [] },
    mensalidades: { status: "a_receber", ata: false, esc: false, guia: false, arquivos: [] }, tarefas: { status: "a_fazer", origem: "interna", visivel_escola: false, arquivos: [], responsaveis: [] },
    prestacoes: { status: "Não iniciado", meses: {}, responsaveis: [] }, balancetes: { responsaveis: [] }, atas: { arquivos: [] } };
  const filt = (rows, f = {}) => {
    let r = rows.filter(x => Object.entries(f.eq || {}).every(([k, v]) => x[k] === v)
      && Object.entries(f.in || {}).every(([k, v]) => v.includes(x[k]))
      && Object.entries(f.gte || {}).every(([k, v]) => x[k] >= v) && Object.entries(f.lte || {}).every(([k, v]) => x[k] <= v));
    if (f.order){ const [k, d] = f.order; r = [...r].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (d === "desc" ? -1 : 1)); }
    return r;
  };
  const pk = t => PK[t] || "id";
  const ins = (t, row) => { const r = { ...(defaults[t] || {}), ...row }; if (!PK[t] && !r.id) r.id = crypto.randomUUID();
    if (t === "tarefas" && !r.criado_em) r.criado_em = now(); T(t).push(r); return r; };
  let user = null, cbs = [];
  try { user = JSON.parse(sessionStorage.getItem(K + "_u")); } catch {}
  const api = {
    demo: true,
    async select(t, f = {}){ fresh(); return structuredClone(filt(T(t), f)); },
    async insert(t, rows){ const out = [].concat(rows).map(r => ins(t, r)); save(); return structuredClone(out); },
    async update(t, match, patch){ const out = filt(T(t), { eq: match }); out.forEach(r => Object.assign(r, patch)); save(); return structuredClone(out); },
    async upsert(t, rows, onConflict, { ignoreDuplicates = false } = {}){
      fresh(); const keys = (onConflict || pk(t)).split(","); const out = [];
      for (const row of [].concat(rows)){
        const ex = T(t).find(x => keys.every(k => x[k] != null && x[k] === row[k]));
        if (ex){ if (!ignoreDuplicates) Object.assign(ex, row); out.push(ex); } else out.push(ins(t, row));
      }
      save(); return structuredClone(out);
    },
    async remove(t, match){ db[t] = T(t).filter(x => !Object.entries(match).every(([k, v]) => x[k] === v)); save(); },
    async rpc(fn, a){ return demoRpc(fn, a); },
    auth: {
      async login(email, pin){ if (!/^\d{6}$/.test(pin)) throw new Error("Invalid login credentials");
        email = email.toLowerCase();
        user = { id: "demo-" + email, email, nome: email.split("@")[0], papel: /^colab/.test(email) ? "colaborador" : "master", ativo: true,
                 modulos: /^colab/.test(email) ? ["escolas","contratos","prestacoes","contabil","atas","tarefas"] : [] };
        if (!T("perfis").some(p => p.id === user.id)){ T("perfis").push(user); save(); }
        try { sessionStorage.setItem(K + "_u", JSON.stringify(user)); } catch {} cbs.forEach(f => f(user, "SIGNED_IN")); },
      async signup(nome, email){ T("perfis").push({ id: "demo-" + email, email, nome, papel: "colaborador", ativo: false, modulos: [] }); save(); },
      async logout(){ user = null; try { sessionStorage.removeItem(K + "_u"); } catch {} cbs.forEach(f => f(null, "SIGNED_OUT")); },
      async resetPin(){}, async setPin(){},
      onChange(cb){ cbs.push(cb); cb(user, "INITIAL"); },
    },
    files: { async upload(path){ return path; }, async url(){ return "#"; } },
  };

  // Versão em JavaScript das funções do portal (espelha o SQL)
  function escPorChave(chave){
    const k = String(chave || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const e = T("escolas").find(x => x.chave === k && x.situacao === "ativa"); if (!e) throw new Error("CHAVE_INVALIDA"); return e;
  }
  function demoRpc(fn, a){
    fresh();
    if (fn === "ver_acessos"){ return T("escolas_acessos").find(x => x.escola_id === a.p_escola) || {}; }
    const e = escPorChave(a.p_chave); const cfg = T("config").find(c => c.chave === "campanha").valor;
    const c = T("contratos").find(x => x.escola_id === e.id && x.ano === cfg.ano);
    if (fn === "portal_dados"){
      const mes = new Date().toISOString().slice(0, 7) + "-01";
      const tarefas = T("tarefas").filter(t => t.escola_id === e.id);
      return structuredClone({
        escola: { nome: e.nome, cnpj: e.cnpj, grupo: e.grupo }, campanha: cfg,
        proposta: c ? { mensalidade: c.honorario, status: c.proposta_status, ata: c.ata, scan: c.scan, guia: c.guia, respNome: c.resp_nome, respCpf: c.resp_cpf,
          respCargo: c.resp_cargo, email: c.resp_email, telefone: c.resp_tel, obsEscola: c.obs_escola, obsFag: c.obs_fag, enviadaEm: c.enviada_em } : null,
        mensalidades: T("mensalidades").filter(m => m.escola_id === e.id && ["a_receber","em_atraso","cobrado"].includes(m.status) && m.competencia <= mes)
          .sort((x, y) => x.competencia.localeCompare(y.competencia)).map(m => ({ competencia: m.competencia, valor: m.valor, status: m.status })),
        pendencias: tarefas.filter(t => t.visivel_escola && t.origem === "interna" && t.status !== "concluida").map(t => ({ id: t.id, titulo: t.titulo, descricao: t.descricao, prazo: t.prazo, status: t.status })),
        solicitacoes: tarefas.filter(t => t.origem === "escola" || t.visivel_escola).sort((x, y) => (y.criado_em || "").localeCompare(x.criado_em || ""))
          .map(t => ({ id: t.id, titulo: t.titulo, descricao: t.descricao, verba: t.verba, status: t.status, criadoEm: t.criado_em,
            comentarios: T("comentarios").filter(k => k.tarefa_id === t.id).map(k => ({ autor: k.autor_tipo, nome: k.autor_nome, texto: k.texto, em: k.criado_em })) })),
      });
    }
    if (fn === "portal_enviar_proposta"){
      if (!c) throw new Error("SEM_PROPOSTA"); if (!["pendente","enviada","ajuste"].includes(c.proposta_status)) throw new Error("PROPOSTA_FECHADA");
      const p = a.p; Object.assign(c, { ata: !!p.ata, scan: e.grupo === "B" ? !!p.scan : false, guia: !!p.guia, resp_nome: p.respNome, resp_cpf: p.respCpf, resp_cargo: p.respCargo,
        resp_email: p.email, resp_tel: p.telefone, obs_escola: p.obsEscola, proposta_status: "enviada", enviada_em: now(), enviada_por: p.enviadaPor || "escola" });
      save(); return { ok: true };
    }
    if (fn === "portal_nova_solicitacao"){ ins("tarefas", { escola_id: e.id, titulo: a.p_titulo, descricao: a.p_descricao, verba: a.p_verba, origem: "escola", visivel_escola: true, criado_por: "Escola" }); save(); return { ok: true }; }
    if (fn === "portal_comentar"){ T("comentarios").push({ id: crypto.randomUUID(), tarefa_id: a.p_tarefa, autor_tipo: "escola", autor_nome: "Escola", texto: a.p_texto, criado_em: now() }); save(); return { ok: true }; }
    throw new Error("rpc desconhecida " + fn);
  }

  // Dados fictícios para testar (nenhum dado real fica no código)
  api.seedDemo = () => {
    if (T("escolas").length) return;
    const nomes = ["CEI JARDIM DAS FLORES","EMEI MONTEIRO LOBATO","EMEF PAULO FREIRE","CEI VILA ESPERANÇA","EMEI CORA CORALINA","EMEF ANÍSIO TEIXEIRA","CEI PARQUE ALEGRE","EMEI CECÍLIA MEIRELES","EMEF DARCY RIBEIRO","CEI SOL NASCENTE","EMEI RUTH ROCHA","EMEF JOSÉ DE ALENCAR"];
    const resp = ["Guilherme","Eunice","Renan","Lavínia"];
    nomes.forEach((n, i) => {
      const base = 400 + (i % 6) * 35; const ant = r2(base / 1.074);
      const e = ins("escolas", { nome: n, cnpj: `00.000.${String(100 + i).padStart(3,"0")}/0001-${String(10 + i)}`, grupo: i % 4 === 0 ? "B" : "A", honorario: base, codigo: `X - ${i + 1}`,
        dre: ["PEN","SM","GUA","ITA"][i % 4], email: `escola${i + 1}@exemplo.org`, telefone: "3000-00" + (10 + i), procuracao_validade: `2027-0${1 + (i % 8)}-15`,
        chave: ["DEMO2345","TEST6789","ABCD2345"][i] || null, responsaveis: [resp[i % 4]] });
      const c = ins("contratos", { escola_id: e.id, ano: 2027, honorario: base }); ins("contratos_privado", { contrato_id: c.id, honorario_ant: ant });
      ins("contratos", { escola_id: e.id, ano: 2026, honorario: ant, status: "assinado_fag" });
      for (let m = 1; m <= 12; m++){ const st = m <= 9 ? "pago" : m === 10 ? (i % 3 ? "pago" : "em_atraso") : "a_receber";
        ins("mensalidades", { escola_id: e.id, competencia: `2026-${String(m).padStart(2,"0")}-01`, valor: ant, status: st, forma: "Cartão", data: st === "pago" ? `2026-${String(m).padStart(2,"0")}-1${i % 9}` : null, responsaveis: [resp[i % 4]] }); }
      ins("prestacoes", { escola_id: e.id, ano: 2026, programa: "PTRF", referencia: "2º Repasse", quem_presta: i % 3 ? "FAG" : "ESCOLA", status: i % 5 ? "Entregue" : "Parado", responsaveis: [resp[i % 4]] });
      ["Básico","Estrutura","Qualidade"].forEach((r, j) => ins("prestacoes", { escola_id: e.id, ano: 2026, programa: "PDDE", referencia: r, status: ["Entregue","Não tem","Em andamento"][(i + j) % 3],
        meses: Object.fromEntries(["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT"].map((mm, k) => [mm, k < 6 + (i % 4) ? "Feito" : "Falta arquivo"])) }));
      ins("balancetes", { escola_id: e.id, ano: 2026, rep1: "Lançado", rep2: i % 3 ? "Lançado" : "S/Demonstrativo", rep3: "Não iniciado", pdde: "Não iniciado", ecd: "Não entrega", ecf: "Não entrega", responsaveis: ["Renan"] });
      ins("atas", { escola_id: e.id, ano: 2025, elaboracao: i % 2 ? "FAG" : "ESCOLA", arquivo_status: "Pronto", documentos_status: "Feito", pagamento: "FAG" });
    });
    const es = T("escolas");
    ins("tarefas", { escola_id: es[0].id, titulo: "Enviar extratos bancários de outubro", status: "pendente", prazo: "2026-11-30", visivel_escola: true, responsaveis: ["Guilherme"], verba: "PTRF" });
    ins("tarefas", { escola_id: es[1].id, titulo: "Balancete 3º e 4º bimestre", status: "a_fazer", prazo: "2026-12-05", responsaveis: ["Renan"], verba: "PTRF" });
    ins("tarefas", { escola_id: es[0].id, titulo: "Preciso da 2ª via do contrato", origem: "escola", visivel_escola: true, criado_por: "Escola" });
    ins("tarefas", { escola_id: null, titulo: "Atualizar site da FAG", status: "em_andamento", responsaveis: ["Renan"], verba: "Outros" });
    save();
  };
  return api;
}

export async function getApi(){
  return (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) ? supabaseApi() : demoApi();
}
