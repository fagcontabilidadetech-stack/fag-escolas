// ===================== quadro estilo monday (grupos, status coloridos, edição na célula) =====================
import { esc, brl, fmtDate, chip, toast, $$ } from "./util.js";

const GROUP_COLORS = ["#3560b5","#ef3a20","#63b231","#fabb17","#f46e16","#66c8f0","#9d50dd","#f89fa1","#037f4c","#22305e","#ff5ac4","#7f5347"];
let popEl = null;
function closePop(){ popEl?.remove(); popEl = null; }
document.addEventListener("mousedown", e => { if (popEl && !popEl.contains(e.target)) closePop(); });
function popover(anchor, html){
  closePop(); popEl = document.createElement("div"); popEl.className = "pop"; popEl.innerHTML = html; document.body.append(popEl);
  const r = anchor.getBoundingClientRect(); const w = popEl.offsetWidth, h = popEl.offsetHeight;
  popEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
  popEl.style.top = (r.bottom + h + 8 > innerHeight ? r.top - h - 6 : r.bottom + 6) + "px";
  return popEl;
}

export function battery(dict, values){
  const n = values.length || 1; const cnt = {};
  values.forEach(v => cnt[v ?? ""] = (cnt[v ?? ""] || 0) + 1);
  return `<div class="battery" title="${esc(Object.entries(cnt).map(([k, v]) => `${dict[k]?.label || k || "vazio"}: ${v}`).join(" · "))}">` +
    Object.entries(cnt).map(([k, v]) => `<i style="width:${v / n * 100}%;background:${dict[k]?.color || "#d9d3bf"}"></i>`).join("") + `</div>`;
}

export class Board {
  constructor(el, opts){
    this.el = el; this.o = { rowKey: "id", collapsed: new Set(), ...opts }; this.q = "";
    this.fkey = "fag_filtros_" + (opts.id || location.hash.replace(/\W/g, "") || "q") + "_" + opts.columns.map(c => c.key).join(".");
    try { const f = JSON.parse(localStorage.getItem(this.fkey)) || {}; this.rules = f.rules || []; this.modo = f.modo || "e"; } catch { this.rules = []; this.modo = "e"; }
    if (opts.lembrarGrupos){ try { const g = JSON.parse(localStorage.getItem(this.fkey + "_grp")); if (g) this.o.collapsed = new Set(g); } catch {} }
    this.render();
  }
  travada(c){ return !!this.o.travas?.has(c.key); }
  saveF(){ try { localStorage.setItem(this.fkey, JSON.stringify({ rules: this.rules, modo: this.modo })); } catch {} }
  fcols(){ return this.o.columns.filter(c => c.type !== "custom" || c.fget).map((c, i) => ({ ...c, _i: this.o.columns.indexOf(c) })); }
  fval(c, r){ return c.fget ? c.fget(r) : (c.get ? c.get(r) : r[c.key]); }
  ftype(c){ return c.ftype || (c.type === "name" || c.type === "custom" ? "text" : c.type); }
  test(r){
    const rs = this.rules.filter(x => x.op && this.o.columns[x.col]); if (!rs.length) return true;
    const one = x => {
      const c = this.o.columns[x.col]; const t = this.ftype(c); let v = this.fval(c, r); const a = x.a, b = x.b;
      const vazio = v == null || v === "" || (Array.isArray(v) && !v.length);
      if (x.op === "vazio") return vazio; if (x.op === "nao_vazio") return !vazio;
      if (t === "status"){ const sel = a || []; if (!sel.length) return true; return x.op === "um_de" ? sel.includes(v ?? "") : !sel.includes(v ?? ""); }
      if (t === "people"){ const ps = v || []; return x.op === "inclui" ? (a || []).some(n => ps.includes(n)) : !(a || []).some(n => ps.includes(n)); }
      if (t === "check") return x.op === "marcado" ? !!v : !v;
      if (t === "money" || t === "num"){ if (a === "" || a == null) return true; v = +v; if (vazio) return false;
        return { igual: v === +a, maior: v > +a, menor: v < +a, entre: v >= +a && v <= +(b ?? a) }[x.op]; }
      if (t === "date"){ const hj = new Date().toISOString().slice(0, 10);
        if (x.op === "vencido") return !vazio && v < hj; if (!a) return true; if (vazio) return false;
        return { antes: v < a, depois: v > a, igual: v === a, entre: v >= a && v <= (b || a) }[x.op]; }
      const sv = String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(), sa = String(a ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (!sa) return true; return { contem: sv.includes(sa), nao_contem: !sv.includes(sa), igual: sv === sa }[x.op];
    };
    return this.modo === "ou" ? rs.some(one) : rs.every(one);
  }
  ops(t){ return { status: [["um_de","é um de"],["nao_e","não é"],["vazio","está vazio"],["nao_vazio","não está vazio"]],
    people: [["inclui","inclui"],["nao_inclui","não inclui"],["vazio","sem ninguém"],["nao_vazio","com alguém"]],
    check: [["marcado","marcado"],["desmarcado","não marcado"]],
    money: [["igual","igual a"],["maior","maior que"],["menor","menor que"],["entre","entre"],["vazio","está vazio"],["nao_vazio","não está vazio"]],
    num: [["igual","igual a"],["maior","maior que"],["menor","menor que"],["entre","entre"],["vazio","está vazio"],["nao_vazio","não está vazio"]],
    date: [["antes","antes de"],["depois","depois de"],["igual","no dia"],["entre","entre"],["vencido","já passou (vencido)"],["vazio","está vazio"],["nao_vazio","não está vazio"]],
    text: [["contem","contém"],["nao_contem","não contém"],["igual","é igual a"],["vazio","está vazio"],["nao_vazio","não está vazio"]] }[t] || [["contem","contém"]]; }
  abrirFiltro(btn){
    const cols = this.fcols();
    const draw = () => {
      const rowHtml = (x, i) => {
        const c = this.o.columns[x.col]; const t = c ? this.ftype(c) : "text"; const sem = ["vazio","nao_vazio","vencido","marcado","desmarcado"].includes(x.op);
        let val = "";
        if (!sem && c){
          if (t === "status"){ const used = new Set((this.o.rows || []).map(r => this.fval(c, r) ?? ""));
            const opts = [...Object.entries(c.dict || {}).map(([k, d]) => [k, d.label, d.color]), ...[...used].filter(k => !(c.dict || {})[k]).map(k => [k, k || "(vazio)", "#bbb"])];
            val = `<div class="f-chips">${opts.map(([k, l, col]) => `<label class="f-chip" style="--cc:${col}"><input type="checkbox" data-fa="${i}" value="${esc(k)}" ${(x.a || []).includes(k) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div>`; }
          else if (t === "people"){ const team = [...new Set([...(this.o.team || []), ...(this.o.rows || []).flatMap(r => this.fval(c, r) || [])])].sort();
            val = `<div class="f-chips">${team.map(n => `<label class="f-chip" style="--cc:#3560b5"><input type="checkbox" data-fa="${i}" value="${esc(n)}" ${(x.a || []).includes(n) ? "checked" : ""}> ${esc(n)}</label>`).join("")}</div>`; }
          else { const it = t === "date" ? "date" : (t === "money" || t === "num") ? "number" : "text";
            val = `<input class="in" data-fv="${i}" type="${it}" value="${esc(x.a ?? "")}" placeholder="valor" style="max-width:170px">${x.op === "entre" ? ` e <input class="in" data-fb="${i}" type="${it}" value="${esc(x.b ?? "")}" style="max-width:170px">` : ""}`; }
        }
        return `<div class="f-row">
          ${i ? `<span class="f-modo">${this.modo === "ou" ? "ou" : "e"}</span>` : `<span class="f-modo">Onde</span>`}
          <select class="in" data-fc="${i}" style="max-width:190px">${cols.map(cc => `<option value="${cc._i}" ${cc._i == x.col ? "selected" : ""}>${esc(cc.label || "Escola")}</option>`).join("")}</select>
          <select class="in" data-fo="${i}" style="max-width:180px">${this.ops(t).map(([k, l]) => `<option value="${k}" ${k === x.op ? "selected" : ""}>${l}</option>`).join("")}</select>
          <div class="f-val">${val}</div>
          <button class="btn ghost sm" data-fx="${i}" title="Remover">✕</button></div>`;
      };
      pop.innerHTML = `<div class="f-box"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px"><b>Filtros avançados</b>
          <span class="small">Combinar: <select class="in" id="fModo" style="width:auto;padding:4px 8px"><option value="e" ${this.modo === "e" ? "selected" : ""}>todas as condições (E)</option><option value="ou" ${this.modo === "ou" ? "selected" : ""}>qualquer condição (OU)</option></select></span></div>
        ${this.rules.map(rowHtml).join("") || `<p class="muted small">Nenhum filtro. Clique em "+ Novo filtro".</p>`}
        <div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm" id="fAdd">+ Novo filtro</button><span style="flex:1"></span>${this.rules.length ? `<button class="btn sm sec" id="fClr">Limpar tudo</button>` : ""}</div></div>`;
      const upd = () => { this.saveF(); this.render(); };
      pop.querySelector("#fModo").onchange = e => { this.modo = e.target.value; upd(); draw(); };
      pop.querySelector("#fAdd").onclick = () => { const c0 = cols[0]; this.rules.push({ col: c0._i, op: this.ops(this.ftype(c0))[0][0], a: null }); draw(); };
      pop.querySelector("#fClr")?.addEventListener("click", () => { this.rules = []; upd(); draw(); });
      pop.querySelectorAll("[data-fc]").forEach(sl => sl.onchange = () => { const x = this.rules[+sl.dataset.fc]; x.col = +sl.value; x.op = this.ops(this.ftype(this.o.columns[x.col]))[0][0]; x.a = null; x.b = null; upd(); draw(); });
      pop.querySelectorAll("[data-fo]").forEach(sl => sl.onchange = () => { this.rules[+sl.dataset.fo].op = sl.value; upd(); draw(); });
      pop.querySelectorAll("[data-fv]").forEach(i => i.oninput = () => { this.rules[+i.dataset.fv].a = i.value; upd(); });
      pop.querySelectorAll("[data-fb]").forEach(i => i.oninput = () => { this.rules[+i.dataset.fb].b = i.value; upd(); });
      pop.querySelectorAll("[data-fa]").forEach(cb => cb.onchange = () => { const k = +cb.dataset.fa; this.rules[k].a = [...pop.querySelectorAll(`[data-fa="${k}"]:checked`)].map(z => z.value); upd(); });
      pop.querySelectorAll("[data-fx]").forEach(b => b.onclick = () => { this.rules.splice(+b.dataset.fx, 1); upd(); draw(); });
    };
    const pop = popover(btn, ""); pop.classList.add("pop-filtro"); draw();
    const r = btn.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + "px"; pop.style.top = (r.bottom + 6) + "px";
  }
  set rows(r){ this.o.rows = r; this.render(); }
  cell(row, c){
    const v = c.get ? c.get(row) : row[c.key];
    const ed = !this.travada(c) && c.editable && (typeof c.editable !== "function" || c.editable(row));
    switch (c.type){
      case "name": return `<a href="#" class="nm" data-open>${esc(v)}</a>${c.sub ? `<div class="small muted">${c.sub(row)}</div>` : ""}`;
      case "status": return chip(c.dict, v, { cls: ed ? "click" : "" });
      case "check": return `<span class="ck ${v ? "on" : ""} ${ed ? "click" : ""}">${v ? "✓" : ""}</span>`;
      case "money": return v == null || v === "" ? `<span class="muted">–</span>` : brl(v);
      case "num": return v ?? "";
      case "date": return fmtDate(v) || (ed ? `<span class="muted small">+ data</span>` : "");
      case "people": return (v || []).length ? (v || []).map(p => `<span class="av" title="${esc(p)}">${esc(p.split(" ").map(x => x[0]).slice(0, 2).join(""))}</span>`).join("") : (ed ? `<span class="muted small">+</span>` : "");
      case "custom": return c.render(row);
      default: return v == null || v === "" ? (ed ? `<span class="muted small">—</span>` : "") : esc(v);
    }
  }
  groups(){
    const { rows = [], groupBy, groupOrder, groupLabel } = this.o;
    const q = this.q.trim().toLowerCase();
    let list = q ? rows.filter(r => (this.o.searchText ? this.o.searchText(r) : JSON.stringify(r)).toLowerCase().includes(q)) : rows;
    if (this.rules?.length) list = list.filter(r => this.test(r));
    if (!groupBy) return [{ key: "_", label: null, rows: list }];
    const m = new Map(); list.forEach(r => { const k = groupBy(r) ?? "—"; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    let keys = [...m.keys()]; if (groupOrder) keys.sort(groupOrder); else keys.sort();
    return keys.map(k => ({ key: k, label: groupLabel ? groupLabel(k) : k, rows: m.get(k) }));
  }
  render(){
    const o = this.o; const cols = o.columns; const gs = this.groups();
    if (this.el.querySelector(".bd-search")) this._focus = document.activeElement?.classList.contains("bd-search");
    const nf = (this.rules || []).filter(x => x.op).length; const tot = gs.reduce((a, g) => a + g.rows.length, 0);
    const head = `<div class="bd-tools">${o.toolbar || ""}<input class="in bd-search" placeholder="Buscar…" value="${esc(this.q)}" style="max-width:240px">
      <button class="btn sm ${nf ? "" : "sec"} bd-fbtn">⚲ Filtrar${nf ? ` (${nf})` : ""}</button>${nf ? `<button class="btn sm ghost bd-fclr">Limpar filtros</button><span class="small muted">${tot} de ${(o.rows || []).length}</span>` : ""}</div>`;
    const tables = gs.map((g, gi) => {
      const color = o.groupColor ? o.groupColor(g.key, gi) : GROUP_COLORS[gi % GROUP_COLORS.length];
      const col = o.collapsed.has(String(g.key));
      const sums = cols.map(c => {
        if (c.type === "money") return `<td class="n"><b>${brl(g.rows.reduce((a, r) => a + (+((c.get ? c.get(r) : r[c.key]) || 0)), 0))}</b></td>`;
        if (c.type === "status" && c.battery !== false) return `<td>${battery(c.dict, g.rows.map(r => c.get ? c.get(r) : r[c.key]))}</td>`;
        if (c.type === "check") return `<td class="c small muted">${g.rows.filter(r => c.get ? c.get(r) : r[c.key]).length}</td>`;
        return "<td></td>";
      }).join("");
      return `<div class="bd-group" style="--gc:${color}">
        ${g.label != null ? `<div class="bd-gh" data-g="${esc(g.key)}"><span class="arr">${col ? "▸" : "▾"}</span> <b>${esc(g.label)}</b> <span class="muted small">${g.rows.length} ${g.rows.length === 1 ? "item" : "itens"}</span></div>` : ""}
        ${col ? "" : `<div class="bd-wrap"><table class="bd"><thead><tr>${cols.map(c => `<th style="${c.width ? `width:${c.width}px;min-width:${c.width}px` : ""}" class="${["money","num"].includes(c.type) ? "n" : ""} ${this.travada(c) ? "trv" : ""}">${esc(c.label)}${c.editable && this.o.travas ? ` <button class="lk" data-lk="${esc(c.key)}" title="${this.travada(c) ? "Coluna travada – clique para destravar" : "Travar coluna"}" ${this.o.podeTravar ? "" : "disabled"}>${this.travada(c) ? "🔒" : "🔓"}</button>` : ""}</th>`).join("")}</tr></thead>
        <tbody>${g.rows.map(r => `<tr data-k="${esc(r[o.rowKey])}">${cols.map((c, ci) => `<td data-c="${ci}" class="${["money","num"].includes(c.type) ? "n" : ""} ${["status","check","people","date"].includes(c.type) ? "c" : ""} ${c.editable ? "ed" : ""}">${this.cell(r, c)}</td>`).join("")}</tr>`).join("")
          || `<tr><td colspan="${cols.length}" class="muted small">Nada por aqui.</td></tr>`}</tbody>
        ${g.rows.length && o.summary !== false ? `<tfoot><tr>${sums}</tr></tfoot>` : ""}</table></div>`}
      </div>`;
    }).join("");
    this.el.innerHTML = head + (tables || `<div class="card muted">${o.emptyText || "Nenhum registro."}</div>`);
    const s = this.el.querySelector(".bd-search");
    this.el.querySelector(".bd-fbtn").onclick = e => { e.stopPropagation(); this.abrirFiltro(e.currentTarget); };
    this.el.querySelector(".bd-fclr")?.addEventListener("click", () => { this.rules = []; this.saveF(); this.render(); });
    s.oninput = () => { this.q = s.value; const p = s.selectionStart; this.render(); const n = this.el.querySelector(".bd-search"); n.focus(); n.setSelectionRange(p, p); };
    $$(".bd-gh", this.el).forEach(h => h.onclick = () => { const k = h.dataset.g; o.collapsed.has(k) ? o.collapsed.delete(k) : o.collapsed.add(k);
      if (o.lembrarGrupos) try { localStorage.setItem(this.fkey + "_grp", JSON.stringify([...o.collapsed])); } catch {}
      this.render(); });
    this.el.querySelectorAll("tbody td").forEach(td => td.onclick = e => this.click(e, td));
    this.el.querySelectorAll("[data-lk]").forEach(b => b.onclick = async e => { e.stopPropagation(); if (!o.podeTravar) return;
      const k = b.dataset.lk; const t = new Set(o.travas); t.has(k) ? t.delete(k) : t.add(k);
      try { await o.onTravar?.([...t]); o.travas = t; this.render(); } catch (err){ toast("Não foi possível salvar a trava: " + err.message); } });
    o.afterRender?.(this.el);
  }
  rowOf(td){ const k = td.parentElement.dataset.k; return this.o.rows.find(r => String(r[this.o.rowKey]) === k); }
  async commit(row, c, value, td){
    const old = c.get ? c.get(row) : row[c.key];
    if (JSON.stringify(old ?? null) === JSON.stringify(value ?? null)) { td.innerHTML = this.cell(row, c); return; }
    if (!c.set) row[c.key] = value; else c.set(row, value);
    td.innerHTML = this.cell(row, c);
    try { await this.o.onEdit(row, c.key, value, c); }
    catch (err){ console.error(err); if (!c.set) row[c.key] = old; else c.set(row, old); td.innerHTML = this.cell(row, c); toast("Não foi possível salvar: " + err.message); }
    this.o.afterEdit?.(row, c);
  }
  click(e, td){
    const row = this.rowOf(td); const c = this.o.columns[+td.dataset.c]; if (!row || !c) return;
    if (e.target.closest("[data-open]")){ e.preventDefault(); this.o.onOpen?.(row); return; }
    if (e.target.closest("a,button")) return;
    const ed = !this.travada(c) && c.editable && (typeof c.editable !== "function" || c.editable(row)); if (!ed) { if (c.type === "name") this.o.onOpen?.(row); return; }
    const v = c.get ? c.get(row) : row[c.key];
    if (c.type === "status"){
      const p = popover(td, `<div class="pop-st">${Object.entries(c.dict).map(([k, d]) => `<button data-v="${esc(k)}" style="background:${d.color}">${esc(d.label)}</button>`).join("")}
        ${c.clearable ? `<button data-v="" style="background:#e9e4d2;color:#555">Limpar</button>` : ""}</div>`);
      p.querySelectorAll("button").forEach(b => b.onclick = () => { closePop(); this.commit(row, c, b.dataset.v || null, td); });
    } else if (c.type === "check"){ this.commit(row, c, !v, td); }
    else if (c.type === "people"){
      const team = this.o.team || []; const sel = new Set(v || []);
      const p = popover(td, `<div class="pop-pp">${[...new Set([...team, ...sel])].map(n => `<label><input type="checkbox" value="${esc(n)}" ${sel.has(n) ? "checked" : ""}> ${esc(n)}</label>`).join("") || "<span class='muted small'>Cadastre a equipe em Equipe.</span>"}
        <button class="btn sm">Aplicar</button></div>`);
      p.querySelector("button").onclick = () => { const nv = [...p.querySelectorAll("input:checked")].map(i => i.value); closePop(); this.commit(row, c, nv, td); };
    } else if (["text","num","money","date","name"].includes(c.type)){
      if (td.querySelector("input")) return;
      const type = c.type === "date" ? "date" : (c.type === "num" || c.type === "money") ? "number" : "text";
      td.innerHTML = `<input class="in cell-in" type="${type}" ${type === "number" ? 'step="0.01"' : ""} value="${esc(v ?? "")}">`;
      const i = td.querySelector("input"); i.focus(); i.select?.();
      const done = save => { if (i._d) return; i._d = 1;
        if (!save){ td.innerHTML = this.cell(row, c); return; }
        let nv = i.value; if (type === "number") nv = nv === "" ? null : Number(nv); if (type === "date" && !nv) nv = null; if (type === "text") nv = nv.trim() || null;
        this.commit(row, c, nv, td); };
      i.onkeydown = ev => { if (ev.key === "Enter") done(true); if (ev.key === "Escape") done(false); };
      i.onblur = () => done(true);
    }
  }
}

// Kanban simples (arrastar entre colunas de status)
export function kanban(el, { rows, dict, statusKey = "status", card, onMove, onOpen }){
  el.innerHTML = `<div class="kb">${Object.entries(dict).map(([k, d]) => {
    const rs = rows.filter(r => (r[statusKey] || "") === k);
    return `<div class="kb-col" data-s="${esc(k)}"><div class="kb-h" style="background:${d.color}">${esc(d.label)} <span>${rs.length}</span></div>
      <div class="kb-list">${rs.map(r => `<div class="kb-card" draggable="true" data-id="${esc(r.id)}">${card(r)}</div>`).join("")}</div></div>`; }).join("")}</div>`;
  let drag = null;
  el.querySelectorAll(".kb-card").forEach(c => { c.ondragstart = () => { drag = c.dataset.id; c.classList.add("drag"); }; c.ondragend = () => c.classList.remove("drag");
    c.onclick = () => onOpen?.(rows.find(r => r.id === c.dataset.id)); });
  el.querySelectorAll(".kb-col").forEach(col => { col.ondragover = e => { e.preventDefault(); col.classList.add("over"); }; col.ondragleave = () => col.classList.remove("over");
    col.ondrop = e => { e.preventDefault(); col.classList.remove("over"); const r = rows.find(x => x.id === drag); if (r && r[statusKey] !== col.dataset.s) onMove(r, col.dataset.s); }; });
}
