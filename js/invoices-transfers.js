// =============================================================
// INVOICES & BANK TRANSFERS (derived views from TRANSACTIONS)
// =============================================================

function renderInvoices(){
  const table = document.getElementById('inv-table');
  const kpiBox = document.getElementById('inv-kpis');
  if(!table) return;
  const project = document.getElementById('inv-filter-project').value;
  const status = document.getElementById('inv-filter-status').value;
  const search = document.getElementById('inv-search').value.trim().toLowerCase();

  // Lấy toàn bộ giao dịch (mọi giao dịch đều có trạng thái hóa đơn), không chỉ giao dịch đã điền số HĐ
  let rows = TRANSACTIONS.slice();
  if(project) rows = rows.filter(t=>t.projectId===project);
  if(status) rows = rows.filter(t=> (t.invoiceStatus||'pending')===status);
  if(search) rows = rows.filter(t=> `${t.invoiceNumber||''} ${t.content||''}`.toLowerCase().includes(search));

  const issuedCount = rows.filter(t=>(t.invoiceStatus||'pending')==='issued').length;
  const pendingCount = rows.length - issuedCount;
  const totalIn = rows.filter(t=>t.type==='IN').reduce((s,t)=>s+Number(t.amount||0),0);
  const totalOut = rows.filter(t=>t.type==='OUT').reduce((s,t)=>s+Number(t.amount||0),0);
  kpiBox.innerHTML =
    kpiCard('✅','gold','Đã xuất hóa đơn', fmtNum(issuedCount)) +
    kpiCard('⏳','gray','Chưa xuất hóa đơn', fmtNum(pendingCount)) +
    kpiCard('💰','teal','Giá trị Thu', `<span class="pos">${fmtVND(totalIn)}</span>`) +
    kpiCard('💸','red','Giá trị Chi', `<span class="neg">${fmtVND(totalOut)}</span>`);

  if(rows.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">🧾</div>Chưa có giao dịch nào phù hợp.</div></td></tr>`;
    return;
  }
  rows = rows.slice().sort((a,b)=> (b.invoiceDate||b.date||'').localeCompare(a.invoiceDate||a.date||''));
  table.innerHTML = `<thead><tr>
    <th>Trạng thái</th><th>Số hóa đơn</th><th>Ngày HĐ</th><th>Dự án</th><th>Loại</th><th>Nội dung</th><th>Giá trị</th><th>Ảnh</th>
  </tr></thead><tbody>${rows.map(t=>`
    <tr>
      <td>${(t.invoiceStatus||'pending')==='issued' ? '<span class="tag tag-gold">✅ Đã xuất</span>' : '<span class="tag tag-gray">⏳ Chưa xuất</span>'}</td>
      <td>${t.invoiceNumber ? '<span class="tag tag-gold">'+escapeHtml(t.invoiceNumber)+'</span>' : '—'}</td>
      <td>${fmtDate(t.invoiceDate || t.date)}</td>
      <td>${escapeHtml(t.projectName||'—')}</td>
      <td>${t.type==='IN' ? '<span class="tag tag-in">Thu</span>' : '<span class="tag tag-out">Chi</span>'}</td>
      <td>${escapeHtml(t.content)}</td>
      <td class="num"><strong>${fmtVND(t.amount)}</strong></td>
      <td>${t.invoiceImage ? `<img src="${t.invoiceImage}" class="thumb-img" data-view-img="${escapeHtml(t.invoiceImage)}" title="Bấm để xem ảnh gốc">` : '—'}</td>
    </tr>`).join('')}</tbody>`;
}

function renderTransfers(){
  const table = document.getElementById('tr-table');
  if(!table) return;
  const project = document.getElementById('tr-filter-project').value;
  const status = document.getElementById('tr-filter-status').value;
  const search = document.getElementById('tr-search').value.trim().toLowerCase();

  // Lấy toàn bộ giao dịch (mọi giao dịch đều có trạng thái chuyển khoản), không chỉ giao dịch đã điền số TK
  let rows = TRANSACTIONS.slice();
  if(project) rows = rows.filter(t=>t.projectId===project);
  if(status) rows = rows.filter(t=> (t.transferStatus||'pending')===status);
  if(search) rows = rows.filter(t=> `${t.bankName||''} ${t.bankAccount||''} ${t.bankHolder||''} ${t.content||''}`.toLowerCase().includes(search));

  if(rows.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">🏦</div>Chưa có giao dịch nào phù hợp.</div></td></tr>`;
    return;
  }
  rows = rows.slice().sort((a,b)=> (b.transferDate||b.date||'').localeCompare(a.transferDate||a.date||''));
  table.innerHTML = `<thead><tr>
    <th>Trạng thái</th><th>Ngày CK</th><th>Ngân hàng</th><th>Số TK</th><th>Chủ TK</th><th>Dự án</th><th>Loại</th><th>Số tiền</th><th>Ảnh</th>
  </tr></thead><tbody>${rows.map(t=>{
    const done = (t.transferStatus||'pending')==='done';
    const doneLabel = t.type==='IN' ? '✅ Đã nhận' : '✅ Đã CK';
    const pendingLabel = t.type==='IN' ? '⏳ Chưa nhận' : '⏳ Chưa CK';
    return `
    <tr>
      <td>${done ? '<span class="tag tag-gold">'+doneLabel+'</span>' : '<span class="tag tag-gray">'+pendingLabel+'</span>'}</td>
      <td>${fmtDate(t.transferDate || t.date)}</td>
      <td><span class="tag tag-blue">${escapeHtml(t.bankName||'—')}</span></td>
      <td class="mono">${escapeHtml(t.bankAccount||'—')}</td>
      <td>${escapeHtml(t.bankHolder||'—')}</td>
      <td>${escapeHtml(t.projectName||'—')}</td>
      <td>${t.type==='IN' ? '<span class="tag tag-in">Thu</span>' : '<span class="tag tag-out">Chi</span>'}</td>
      <td class="num"><strong>${fmtVND(t.amount)}</strong></td>
      <td>${t.transferImage ? `<img src="${t.transferImage}" class="thumb-img" data-view-img="${escapeHtml(t.transferImage)}" title="Bấm để xem ảnh gốc">` : '—'}</td>
    </tr>`;
  }).join('')}</tbody>`;
}

['inv-filter-project','inv-filter-status','inv-search'].forEach(id=>{
  document.getElementById(id).addEventListener('input', renderInvoices);
  document.getElementById(id).addEventListener('change', renderInvoices);
});
['tr-filter-project','tr-filter-status','tr-search'].forEach(id=>{
  document.getElementById(id).addEventListener('input', renderTransfers);
  document.getElementById(id).addEventListener('change', renderTransfers);
});

// Xem ảnh phóng to khi bấm vào thumbnail (dùng chung cho cả 2 bảng)
document.addEventListener('click', (e)=>{
  const imgSrc = e.target.closest('[data-view-img]')?.dataset.viewImg;
  if(imgSrc) openImageLightbox(imgSrc);
});
function openImageLightbox(src){
  let box = document.getElementById('img-lightbox');
  if(!box){
    box = el(`<div id="img-lightbox" class="modal-backdrop" style="align-items:center;">
      <img style="max-width:90vw;max-height:90vh;border-radius:10px;" id="img-lightbox-src">
    </div>`);
    box.addEventListener('click', ()=> box.classList.remove('open'));
    document.body.appendChild(box);
  }
  document.getElementById('img-lightbox-src').src = src;
  box.classList.add('open');
}
