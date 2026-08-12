// =============================================================
// INVOICES & BANK TRANSFERS (derived views from TRANSACTIONS)
// =============================================================

function renderInvoices(){
  const table = document.getElementById('inv-table');
  const kpiBox = document.getElementById('inv-kpis');
  if(!table) return;
  const project = document.getElementById('inv-filter-project').value;
  const search = document.getElementById('inv-search').value.trim().toLowerCase();

  let rows = TRANSACTIONS.filter(t=> t.invoiceNumber);
  if(project) rows = rows.filter(t=>t.projectId===project);
  if(search) rows = rows.filter(t=> (t.invoiceNumber||'').toLowerCase().includes(search));

  const totalIn = rows.filter(t=>t.type==='IN').reduce((s,t)=>s+Number(t.amount||0),0);
  const totalOut = rows.filter(t=>t.type==='OUT').reduce((s,t)=>s+Number(t.amount||0),0);
  kpiBox.innerHTML = `
    <div class="kpi-card"><div class="lbl">Tổng số hóa đơn</div><div class="val">${fmtNum(rows.length)}</div></div>
    <div class="kpi-card"><div class="lbl">Giá trị hóa đơn Thu</div><div class="val pos">${fmtVND(totalIn)}</div></div>
    <div class="kpi-card"><div class="lbl">Giá trị hóa đơn Chi</div><div class="val neg">${fmtVND(totalOut)}</div></div>`;

  if(rows.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">🧾</div>Chưa có giao dịch nào gắn hóa đơn.</div></td></tr>`;
    return;
  }
  rows = rows.slice().sort((a,b)=> (b.invoiceDate||b.date||'').localeCompare(a.invoiceDate||a.date||''));
  table.innerHTML = `<thead><tr>
    <th>Số hóa đơn</th><th>Ngày HĐ</th><th>Dự án</th><th>Loại</th><th>Nội dung</th><th>Giá trị</th>
  </tr></thead><tbody>${rows.map(t=>`
    <tr>
      <td><span class="tag tag-gold">${escapeHtml(t.invoiceNumber)}</span></td>
      <td>${fmtDate(t.invoiceDate || t.date)}</td>
      <td>${escapeHtml(t.projectName||'—')}</td>
      <td>${t.type==='IN' ? '<span class="tag tag-in">Thu</span>' : '<span class="tag tag-out">Chi</span>'}</td>
      <td>${escapeHtml(t.content)}</td>
      <td class="num"><strong>${fmtVND(t.amount)}</strong></td>
    </tr>`).join('')}</tbody>`;
}

function renderTransfers(){
  const table = document.getElementById('tr-table');
  if(!table) return;
  const project = document.getElementById('tr-filter-project').value;
  const search = document.getElementById('tr-search').value.trim().toLowerCase();

  let rows = TRANSACTIONS.filter(t=> t.bankAccount || t.bankName);
  if(project) rows = rows.filter(t=>t.projectId===project);
  if(search) rows = rows.filter(t=> `${t.bankName} ${t.bankAccount} ${t.bankHolder}`.toLowerCase().includes(search));

  if(rows.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">🏦</div>Chưa có giao dịch nào có thông tin chuyển khoản.</div></td></tr>`;
    return;
  }
  rows = rows.slice().sort((a,b)=> (b.transferDate||b.date||'').localeCompare(a.transferDate||a.date||''));
  table.innerHTML = `<thead><tr>
    <th>Ngày CK</th><th>Ngân hàng</th><th>Số TK</th><th>Chủ TK</th><th>Dự án</th><th>Loại</th><th>Số tiền</th>
  </tr></thead><tbody>${rows.map(t=>`
    <tr>
      <td>${fmtDate(t.transferDate || t.date)}</td>
      <td><span class="tag tag-blue">${escapeHtml(t.bankName||'—')}</span></td>
      <td class="mono">${escapeHtml(t.bankAccount||'—')}</td>
      <td>${escapeHtml(t.bankHolder||'—')}</td>
      <td>${escapeHtml(t.projectName||'—')}</td>
      <td>${t.type==='IN' ? '<span class="tag tag-in">Thu</span>' : '<span class="tag tag-out">Chi</span>'}</td>
      <td class="num"><strong>${fmtVND(t.amount)}</strong></td>
    </tr>`).join('')}</tbody>`;
}

['inv-filter-project','inv-search'].forEach(id=>{
  document.getElementById(id).addEventListener('input', renderInvoices);
});
['tr-filter-project','tr-search'].forEach(id=>{
  document.getElementById(id).addEventListener('input', renderTransfers);
});
