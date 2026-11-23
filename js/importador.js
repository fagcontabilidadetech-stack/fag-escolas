// ===================== Importador monday → CRM (somente leitura no monday) =====================
import { esc, modal, toast, ST, canon, makeMatcher, normName, onlyDig, noAcc, MESES, MESES_LONGOS, r2 } from "./util.js";

const BOARDS = {
  info: { id: 8582711156, nome: "Info APM's" },
  contratos: { id: 7834448174, nome: "Contratos (2025 e 2026)" },
  mensalidades: { id: 18398244198, nome: "Mensalidades 2026" },
  ptrf: { id: 7370212612, nome: "Prestação PTRF" },
  pdde: { id: 7811309566, nome: "Prestação PDDE", sub: true },
  bal25: { id: 9247272999, nome: "Balancetes Escolas 2025", ano: 2025 },
  bal26: { id: 18428274766, nome: "Balancetes Escolas 2026", ano: 2026 },
  ata: { id: 8690330945, nome: "ATA Bienal 2025" },
  tarefas: { id: 18406772926, nome: "Tarefas APM" },
};
const SUB_MESES = { status: "JAN", color_mm5rhqjv: "FEV", color_mm5r6381: "MAR", color_mm5rh095: "ABR", color_mm5rypv2: "MAI", color_mm5rfbh: "JUN",
  color_mm5rnd3a: "JUL", color_mm5rvtsc: "AGO", color_mm5rje5s: "SET", color_mm5rrfvt: "OUT", color_mm5r35a7: "NOV", color_mm5ryv1r: "DEZ" };

async function gql(token, query, variables){
  const r = await fetch("https://api.monday.com/v2", { method: "POST", headers: { "Content-Type": "application/json", Authorization: token.trim(), "API-Version": "2024-10" }, body: JSON.stringify({ query, variables }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || b.errors || b.error_message) throw new Error((b.errors?.[0]?.message || b.error_message || r.statusText) + "");
  return b.data;
}
async function fetchBoard(token, bid, sub){
  const ITEM = `id name created_at group{title} column_values{id text}${sub ? " subitems{ name column_values{id text} }" : ""}`;
  let d = await gql(token, `query($b:[ID!]){boards(ids:$b){items_page(limit:500){cursor items{${ITEM}}}}}`, { b: [String(bid)] });
  let p = d.boards[0].items_page, items = p.items, cur = p.cursor;
  while (cur){ d = await gql(token, `query($c:String!){next_items_page(limit:500,cursor:$c){cursor items{${ITEM}}}}`, { c: cur }); p = d.next_items_page; items = items.concat(p.items); cur = p.cursor; }
  return items.map(it => { const v = Object.fromEntries(it.column_values.map(c => [c.id, c.text || ""]));
    return { _id: +it.id, _name: it.name, _group: it.group?.title || "", _created: it.created_at, ...v,
      _sub: (it.subitems || []).map(s => ({ name: s.name, ...Object.fromEntries(s.column_values.map(c => [c.id, c.text || ""])) })) }; });
}
const num = v => { if (v == null || v === "") return null; const n = Number(String(v).replace(",", ".")); return isNaN(n) ? null : r2(n); };
const date = v => /^\d{4}-\d{2}-\d{2}/.test(v || "") ? v.slice(0, 10) : null;
const people = v => (v || "").split(",").map(s => s.trim()).filter(Boolean);
const files = v => (v || "").split(/,\s*(?=https?:)/).map(s => s.trim()).filter(s => /^https?:/.test(s)).map(u => ({ nome: decodeURIComponent(u.split("/").pop()).replace(/\.\w+$/, m => m), url: u }));
const yearOf = s => +((s || "").match(/20\d\d/) || [])[0] || null;
function mesDoGrupo(t){ const n = noAcc(t).toLowerCase(); const i = MESES_LONGOS.findIndex(m => n.includes(noAcc(m).toLowerCase())); const y = yearOf(t); return i >= 0 && y ? `${y}-${String(i + 1).padStart(2, "0")}-01` : null; }

export function abrirImportador(S, done){
  const md = modal(`<h2>Importar do monday</h2>
    <p class="small">1. No monday, clique na sua foto → <b>Desenvolvedores</b> → <b>Meus tokens de acesso</b> → copie o token.<br>2. Cole abaixo. O token não fica salvo.</p>
    <div class="field"><label class="f">Token do monday</label><input class="in" id="tk" type="password" autocomplete="off"></div>
    <div class="field"><label class="f">Quadros</label>${Object.entries(BOARDS).map(([k, b]) => `<label class="small" style="display:inline-flex;gap:5px;margin:0 12px 6px 0"><input type="checkbox" data-b="${k}" checked> ${esc(b.nome)}</label>`).join("")}</div>
    <div style="display:flex;gap:8px"><button class="btn" id="go">Ler o monday</button><button class="btn sec" id="cx">Fechar</button></div>
    <div id="log" class="small" style="margin-top:12px;white-space:pre-wrap"></div><div id="rev"></div>`, { wide: true });
  md.q("#cx").onclick = md.close;
  const log = t => { md.q("#log").textContent += t + "\n"; };
  let dados = null;
  md.q("#go").onclick = async () => {
    const tk = md.q("#tk").value; if (!tk) return toast("Cole o token do monday.");
    const sel = [...md.querySelectorAll("[data-b]:checked")].map(x => x.dataset.b);
    md.q("#go").disabled = true; md.q("#log").textContent = ""; md.q("#rev").innerHTML = ""; dados = {};
    try { for (const k of sel){ log(`Lendo ${BOARDS[k].nome}…`); dados[k] = await fetchBoard(tk, BOARDS[k].id, BOARDS[k].sub); log(`  ${dados[k].length} itens`); }
      revisar(); }
    catch (e){ log("Erro: " + e.message + (/fetch/i.test(e.message) ? "\n(O navegador bloqueou o acesso ao monday. Tente pelo Chrome atualizado.)" : "")); }
    finally { md.q("#go").disabled = false; }
  };

  // Mostra os nomes que não casaram com nenhuma escola e permite associar à mão
  // escolas do Info APM's que não estão no CRM → serão criadas como ex-clientes
  function exClientes(){
    if (!dados.info) return [];
    const tem = new Set(S.escolas.map(e => onlyDig(e.cnpj)));
    return dados.info.filter(r => onlyDig(r.text_mknj7v3m).length === 14 && !tem.has(onlyDig(r.text_mknj7v3m)));
  }
  const pendAlias = {};   // aliases escolhidos para ex-clientes ainda não criadas (cnpj → nomes)

  // Mostra os nomes que não casaram com nenhuma escola e permite associar à mão
  function revisar(){
    const ex = exClientes();
    const virt = ex.map(r => ({ id: "novo:" + onlyDig(r.text_mknj7v3m), nome: r._name, aliases: [] }));
    const match = makeMatcher([...S.escolas, ...virt]);
    const nomes = new Map();
    for (const [k, rows] of Object.entries(dados)){
      if (k === "info") continue;
      for (const r of rows){ const n = k === "tarefas" ? r.short_textx415s3x0 : r._name; if (!n || /^(FAG|TODAS)$/i.test(n.trim())) continue;
        if (k === "contratos" && yearOf(r._group) === S.cfg.ano) continue;
        if (!match(n)) nomes.set(normName(n).join(" "), n); }
    }
    const opts = `<option value="">— ignorar —</option>` + S.escolas.map(e => `<option value="${e.id}">${esc(e.nome)}${e.situacao !== "ativa" ? " (ex-cliente)" : ""}</option>`).join("")
      + virt.map(v => `<option value="${v.id}">${esc(v.nome)} (ex-cliente, nova)</option>`).join("");
    md.q("#rev").innerHTML = `<hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
      ${ex.length ? `<div class="notice info small"><b>${ex.length} escola(s) do Info APM's não estão no CRM</b> e serão cadastradas como <b>ex-clientes</b>, com o histórico delas: ${ex.map(r => esc(r._name)).join(", ")}.</div>` : ""}
      ${nomes.size ? `<h3>${nomes.size} nome(s) do monday sem escola correspondente</h3><p class="small muted">Associe à escola certa (o nome fica salvo como "outro nome" da escola) ou deixe em ignorar.</p>
      <div style="max-height:280px;overflow:auto">${[...nomes.values()].sort().map(n => `<div style="display:flex;gap:8px;align-items:center;margin-bottom:5px"><span class="small" style="flex:1">${esc(n)}</span><select class="in" style="max-width:340px" data-al="${esc(n)}">${opts}</select></div>`).join("")}</div>`
      : `<div class="notice ok small">Todas as escolas do monday foram reconhecidas.</div>`}
      <button class="btn ok" id="imp" style="margin-top:10px">Importar para o CRM</button>`;
    md.q("#imp").onclick = importar;
  }

  async function importar(){
    md.q("#imp").disabled = true;
    try {
      // 1) salva os "outros nomes" escolhidos
      for (const s of md.querySelectorAll("[data-al]")){ if (!s.value) continue;
        if (s.value.startsWith("novo:")){ (pendAlias[s.value.slice(5)] ||= []).push(s.dataset.al); continue; }
        const e = S.esc[s.value];
        e.aliases = [...new Set([...(e.aliases || []), s.dataset.al])]; await S.api.update("escolas", { id: e.id }, { aliases: e.aliases }); }
      // 2) cadastra como ex-clientes as escolas do Info APM's que não estão no CRM
      const ex = exClientes();
      if (ex.length){ log(`Cadastrando ${ex.length} ex-cliente(s)…`);
        const novas = await S.api.upsert("escolas", ex.map(r => ({ nome: r._name.trim(), cnpj: r.text_mknj7v3m.trim(), situacao: "ex-cliente", codigo: r.text_mksrehar || null,
          dre: r.text_mknj6f3p || null, email: r.email_mknjfk10 || null, telefone: r.text_mknjh05p || null, ccm: r.text_mknjmtrd || null,
          procuracao_validade: date(r.date_mksfaz4r), monday_id: r._id, aliases: pendAlias[onlyDig(r.text_mknj7v3m)] || [] })), "cnpj");
        novas.forEach(e => { if (!S.esc[e.id]){ S.escolas.push(e); S.esc[e.id] = e; } }); }
      const match = makeMatcher(S.escolas);
      const idOf = n => match(n)?.escola.id || null;
      const R = {};
      const up = async (t, rows, conflict) => { if (!rows.length) return []; const out = await S.api.upsert(t, rows, conflict); R[t] = (R[t] || 0) + out.length; return out; };
      const dedupe = (rows, key) => { const m = new Map(); rows.forEach(r => m.set(key(r), r)); return [...m.values()]; };

      if (dados.info){ log("Cadastro (Info APM's)…"); const byCnpj = Object.fromEntries(S.escolas.map(e => [onlyDig(e.cnpj), e]));
        const upd = [], acc = [];
        for (const r of dados.info){ const e = byCnpj[onlyDig(r.text_mknj7v3m)]; if (!e) continue;
          upd.push({ ...e, codigo: r.text_mksrehar || e.codigo, dre: r.text_mknj6f3p || e.dre, email: r.email_mknjfk10 || e.email, telefone: r.text_mknjh05p || e.telefone,
            ccm: r.text_mknjmtrd || e.ccm, procuracao_validade: date(r.date_mksfaz4r) || e.procuracao_validade, monday_id: r._id,
            aliases: [...new Set([...(e.aliases || []), ...(r._name.toUpperCase() !== e.nome.toUpperCase() ? [r._name] : [])])] });
          if (S.me.papel === "master" && (r.text_mknjf6kq || r.text_mknj47rb || r.text_mknjtha)) acc.push({ escola_id: e.id, sig_login: r.text_mknjf6kq || null, sig_senha: r.text_mknj47rb || null, senha_web: r.text_mknjtha || null }); }
        await up("escolas", upd, "cnpj"); await up("escolas_acessos", acc, "escola_id"); }

      if (dados.contratos){ log("Contratos…"); const rows = [], priv = [];
        for (const r of dados.contratos){ const ano = yearOf(r._group); const id = idOf(r._name); if (!id || !ano || ano === S.cfg.ano) continue;
          rows.push({ escola_id: id, ano, status: canon(ST.contrato, r.project_status) || "elaboracao", honorario: num(r.dup__of_honor_rio_2024_mkmmc7ra), pacotes: num(r.numeric_mkxf5sjp),
            proposta_status: "aprovada", monday_id: r._id, arquivos: [...files(r.dup__of_contratos__1), ...files(r.arquivos__1)] });
          priv.push({ _k: id + ano, honorario_ant: num(r.n_meros_mkmmdj60), valor_fag: num(r.dup__of_honor_rio_2025_mkmmwbfr) }); }
        const out = await up("contratos", dedupe(rows, r => r.escola_id + r.ano), "escola_id,ano");
        if (S.me.papel === "master"){ const pm = Object.fromEntries(priv.map(p => [p._k, p]));
          await up("contratos_privado", out.map(c => ({ contrato_id: c.id, honorario_ant: pm[c.escola_id + c.ano]?.honorario_ant ?? null, valor_fag: pm[c.escola_id + c.ano]?.valor_fag ?? null })), "contrato_id"); } }

      if (dados.mensalidades){ log("Mensalidades…"); const rows = [];
        for (const r of dados.mensalidades){ const id = idOf(r._name), comp = mesDoGrupo(r._group); if (!id || !comp) continue;
          rows.push({ escola_id: id, competencia: comp, valor: num(r.n_meros__1), status: canon(ST.mensalidade, r.project_status) || "a_receber",
            forma: { "cartão": "Cartão", "transf.": "Transf.", "boleto": "Boleto", "cheque": "Cheque" }[(r.tags6__1 || "").toLowerCase()] || null,
            ata: !!r.sinal_de_confirma__o_mkn2c2gz, esc: !!r.dup__of_ata_mkn2gf35, guia: !!r.dup__of_esc_mkn2eb4y, cartorio: num(r.dup__of_valor_mknb90j9),
            data: date(r.date), responsaveis: people(r.project_owner), monday_id: r._id }); }
        await up("mensalidades", dedupe(rows, r => r.escola_id + r.competencia), "escola_id,competencia"); }

      if (dados.ptrf){ log("Prestações PTRF…"); const rows = [];
        for (const r of dados.ptrf){ const id = idOf(r._name), ano = yearOf(r._group); if (!id || !ano) continue;
          const ref = ((r._group.match(/(\d+)\s*[°º]?\s*Repasse/i) || [])[1] ? (r._group.match(/(\d+)\s*[°º]?\s*Repasse/i)[1] + "º Repasse") : r._group);
          const [ini, fim] = (r.project_timeline || "").split(" - ");
          rows.push({ escola_id: id, ano, programa: "PTRF", referencia: ref, quem_presta: r.lista_suspensa_mkmnarbe || null, status: canon(ST.prestacao, r.project_status, { feitoVira: "Entregue" }) || "Não iniciado",
            prioridade: r.priority_1 || null, inicio: date(ini), prazo: date(fim), entregue_em: date(r.date), responsaveis: people(r.project_owner), monday_id: r._id }); }
        await up("prestacoes", dedupe(rows, r => r.escola_id + r.ano + r.referencia), "escola_id,ano,programa,referencia"); }

      if (dados.pdde){ log("Prestações PDDE…"); const rows = [];
        for (const r of dados.pdde){ const id = idOf(r._name), ano = yearOf(r._group) || 2026; if (!id) continue;
          [["Básico", "project_status"], ["Estrutura", "dup__of_b_sico__1"], ["Qualidade", "dup__of_estrutura__1"]].forEach(([ref, col]) => {
            const sub = r._sub.find(s => noAcc(s.name).toLowerCase().includes(noAcc(ref).toLowerCase()));
            const meses = {}; if (sub) for (const [cid, mm] of Object.entries(SUB_MESES)) { const v = canon(ST.mes, sub[cid]); if (v) meses[mm] = v; }
            rows.push({ escola_id: id, ano, programa: "PDDE", referencia: ref, status: canon(ST.prestacao, r[col], { feitoVira: "Entregue" }) || "Não iniciado", meses,
              obs: r.text_mkyw1px0 || null, responsaveis: people(r.project_owner), monday_id: r._id }); }); }
        await up("prestacoes", dedupe(rows, r => r.escola_id + r.ano + r.referencia), "escola_id,ano,programa,referencia"); }

      for (const k of ["bal25", "bal26"]) if (dados[k]){ log(`Balancetes ${BOARDS[k].ano}…`); const rows = [];
        for (const r of dados[k]){ const id = idOf(r._name); if (!id) continue;
          rows.push({ escola_id: id, ano: BOARDS[k].ano, rep1: canon(ST.balancete, r.project_status), rep2: canon(ST.balancete, r.status__1), rep3: canon(ST.balancete, r.color__1),
            pdde: canon(ST.balancete, r.color0__1), ecd: canon(ST.obrigacao, r.status_mkmtccte), ecf: canon(ST.obrigacao, r.dup__of_ecd_mkmth6j2), responsaveis: people(r.project_owner), monday_id: r._id }); }
        await up("balancetes", dedupe(rows, r => r.escola_id + r.ano), "escola_id,ano"); }

      if (dados.ata){ log("ATA Bienal…"); const rows = [];
        for (const r of dados.ata){ const id = idOf(r._name), ano = yearOf(r._group) || 2025; if (!id) continue;
          rows.push({ escola_id: id, ano, elaboracao: r.dropdown_mkpdy69r || null, arquivo_status: canon(ST.ataArquivo, r.status), documentos_status: canon(ST.ataDocs, r.color_mkp024km),
            data_envio: date(r.data), pagamento: canon(ST.ataPag, r.color_mkp0z334), data_entrada_ata: date(r.date_mkp06gsp), data_entrada_termo: date(r.date_mkqxb5qh),
            valor_cartorio: num(r.numeric_mkp0kg83), arquivos: files(r.file_mkp0kx9a), monday_id: r._id }); }
        await up("atas", dedupe(rows, r => r.escola_id + r.ano), "escola_id,ano"); }

      if (dados.tarefas){ log("Tarefas…"); const rows = dados.tarefas.map(r => {
          const st = canon(ST.tarefa, r.status); const n = r.short_textx415s3x0;
          return { titulo: r._name, escola_id: n && !/^(FAG|TODAS)$/i.test(n.trim()) ? idOf(n) : null, verba: r.dropdown_mm20e6ex || null,
            status: ST.tarefa[st] ? st : "a_fazer", prazo: date(r.date4), responsaveis: people(r.person), arquivos: files(r.file_mm2095ne),
            criado_em: r._created, origem: "interna", criado_por: "monday", monday_id: r._id, descricao: n && /^(FAG|TODAS)$/i.test(n.trim()) ? `Escola no monday: ${n}` : null }; });
        await up("tarefas", rows, "monday_id"); }

      log("\n✅ Importação concluída: " + Object.entries(R).map(([t, n]) => `${t} ${n}`).join(" · "));
      toast("Importação concluída"); done?.();
    } catch (e){ console.error(e); log("Erro: " + e.message); }
    finally { md.q("#imp").disabled = false; }
  }
}
