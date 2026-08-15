// =============================================================
// TRANSACTIONS (THU CHI) MODULE
// =============================================================

let TRANSACTIONS = []; // cache
let currentTxType = 'IN';
let currentInvoiceImage = '';
let currentTransferImage = '';

function setImagePreview(kind, dataUrl){
  const img = document.getElementById(`tx-${kind}-image-preview`);
  const btn = document.getElementById(`tx-${kind}-image-remove`);
  if(dataUrl){
    img.src = dataUrl; img.style.display = 'block'; btn.style.display = 'inline-flex';
  } else {
    img.src = ''; img.style.display = 'none'; btn.style.display = 'none';
  }
}

document.getElementById('tx-invoice-image').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  toast('Đang nén ảnh...');
  try{
    currentInvoiceImage = await compressImageFile(file, 900, 0.65);
    setImagePreview('invoice', currentInvoiceImage);
  }catch(err){ toast('Không đọc được ảnh, thử ảnh khác'); }
});
document.getElementById('tx-invoice-image-remove').addEventListener('click', ()=>{
  currentInvoiceImage = '';
  document.getElementById('tx-invoice-image').value = '';
  setImagePreview('invoice', '');
});
document.getElementById('tx-transfer-image').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  toast('Đang nén ảnh...');
  try{
    currentTransferImage = await compressImageFile(file, 900, 0.65);
    setImagePreview('transfer', currentTransferImage);
  }catch(err){ toast('Không đọc được ảnh, thử ảnh khác'); }
});
document.getElementById('tx-transfer-image-remove').addEventListener('click', ()=>{
  currentTransferImage = '';
  document.getElementById('tx-transfer-image').value = '';
  setImagePreview('transfer', '');
});

function listenTransactions(){
  db.collection('transactions').orderBy('date','desc').onSnapshot((snap)=>{
    TRANSACTIONS = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    renderTxTable();
    renderProjectsTable();
    if(window.renderInvoices) renderInvoices();
    if(window.renderTransfers) renderTransfers();
    if(window.renderDashboard) renderDashboard();
    if(window.renderReports) renderReports();
    if(window.renderPnl) renderPnl();
  }, (err)=> console.error('tx listen error', err));
}

function setTxType(type){
  currentTxType = type;
  document.getElementById('seg-in').className = type==='IN' ? 'active-in' : '';
  document.getElementById('seg-out').className = type==='OUT' ? 'active-out' : '';
}
document.getElementById('seg-in').addEventListener('click', ()=> setTxType('IN'));
document.getElementById('seg-out').addEventListener('click', ()=> setTxType('OUT'));

function openTxModal(id){
  document.getElementById('tx-modal-title').textContent = id ? 'Sửa giao dịch' : 'Nhập giao dịch thu chi';
  document.getElementById('tx-id').value = id || '';
  const t = id ? TRANSACTIONS.find(x=>x.id===id) : {};
  setTxType(t.type || 'IN');
  document.getElementById('tx-project').value = t.projectId || '';
  document.getElementById('tx-date').value = t.date || todayISO();
  document.getElementById('tx-code').value = t.code || '';
  document.getElementById('tx-content').value = t.content || '';
  document.getElementById('tx-desc').value = t.description || '';
  document.getElementById('tx-unit').value = t.unit || '';
  document.getElementById('tx-qty').value = t.qty || '';
  setMoneyInputValue(document.getElementById('tx-unitprice'), t.unitPrice);
  setMoneyInputValue(document.getElementById('tx-amount'), t.amount);
  document.getElementById('tx-invoice-number').value = t.invoiceNumber || '';
  document.getElementById('tx-invoice-date').value = t.invoiceDate || '';
  document.getElementById('tx-bank-name').value = t.bankName || '';
  document.getElementById('tx-bank-account').value = t.bankAccount || '';
  document.getElementById('tx-bank-holder').value = t.bankHolder || '';
  document.getElementById('tx-transfer-date').value = t.transferDate || '';
  document.getElementById('tx-note').value = t.note || '';
  currentInvoiceImage = t.invoiceImage || '';
  currentTransferImage = t.transferImage || '';
  document.getElementById('tx-invoice-image').value = '';
  document.getElementById('tx-transfer-image').value = '';
  setImagePreview('invoice', currentInvoiceImage);
  setImagePreview('transfer', currentTransferImage);
  openModal('modal-tx');
}

document.getElementById('btn-add-tx').addEventListener('click', ()=> openTxModal(null));

// auto-calc thành tiền = SL * đơn giá (nếu cả 2 có giá trị và người dùng chưa gõ tay)
document.getElementById('tx-unitprice').addEventListener('input', ()=>{
  formatMoneyInput(document.getElementById('tx-unitprice'));
  const qty = Number(document.getElementById('tx-qty').value)||0;
  const price = parseMoneyInput(document.getElementById('tx-unitprice'));
  if(qty && price) setMoneyInputValue(document.getElementById('tx-amount'), qty*price);
});
document.getElementById('tx-qty').addEventListener('input', ()=>{
  const qty = Number(document.getElementById('tx-qty').value)||0;
  const price = parseMoneyInput(document.getElementById('tx-unitprice'));
  if(qty && price) setMoneyInputValue(document.getElementById('tx-amount'), qty*price);
});
document.getElementById('tx-amount').addEventListener('input', ()=> formatMoneyInput(document.getElementById('tx-amount')));

document.getElementById('save-tx-btn').addEventListener('click', async ()=>{
  const id = document.getElementById('tx-id').value;
  const projectId = document.getElementById('tx-project').value;
  const content = document.getElementById('tx-content').value.trim();
  const date = document.getElementById('tx-date').value;
  const amount = parseMoneyInput(document.getElementById('tx-amount'));
  if(!projectId){ toast('Vui lòng chọn dự án'); return; }
  if(!content){ toast('Vui lòng nhập nội dung'); return; }
  if(!date){ toast('Vui lòng chọn ngày'); return; }
  if(!amount){ toast('Vui lòng nhập thành tiền'); return; }
  if((currentInvoiceImage.length + currentTransferImage.length) > 900000){
    toast('Ảnh quá lớn, vui lòng chọn ảnh khác hoặc chụp ở độ phân giải thấp hơn');
    return;
  }

  const proj = projectById(projectId);
  const data = {
    type: currentTxType,
    projectId, projectName: proj ? proj.name : '',
    date, code: document.getElementById('tx-code').value.trim(),
    content, description: document.getElementById('tx-desc').value.trim(),
    unit: document.getElementById('tx-unit').value.trim(),
    qty: Number(document.getElementById('tx-qty').value)||0,
    unitPrice: parseMoneyInput(document.getElementById('tx-unitprice')),
    amount,
    invoiceNumber: document.getElementById('tx-invoice-number').value.trim(),
    invoiceDate: document.getElementById('tx-invoice-date').value,
    bankName: document.getElementById('tx-bank-name').value.trim(),
    bankAccount: document.getElementById('tx-bank-account').value.trim(),
    bankHolder: document.getElementById('tx-bank-holder').value.trim(),
    transferDate: document.getElementById('tx-transfer-date').value,
    note: document.getElementById('tx-note').value.trim(),
    invoiceImage: currentInvoiceImage,
    transferImage: currentTransferImage,
  };
  try{
    if(id){
      await db.collection('transactions').doc(id).update(data);
      toast('Đã cập nhật giao dịch');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = auth.currentUser.email;
      await db.collection('transactions').add(data);
      toast('Đã lưu giao dịch');
    }
    closeModal('modal-tx');
  }catch(err){ toast('Lỗi: '+err.message); }
});

function getFilteredTx(){
  const project = document.getElementById('tx-filter-project').value;
  const type = document.getElementById('tx-filter-type').value;
  const month = document.getElementById('tx-filter-month').value;
  const search = document.getElementById('tx-search').value.trim().toLowerCase();
  return TRANSACTIONS.filter(t=>{
    if(project && t.projectId!==project) return false;
    if(type && t.type!==type) return false;
    if(month && monthKey(t.date)!==month) return false;
    if(search && !(`${t.content} ${t.description} ${t.code}`.toLowerCase().includes(search))) return false;
    return true;
  });
}

function renderTxTable(){
  const table = document.getElementById('tx-table');
  if(!table) return;
  const rows = getFilteredTx();
  if(rows.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">⇄</div>Chưa có giao dịch nào phù hợp bộ lọc.</div></td></tr>`;
    return;
  }
  table.innerHTML = `<thead><tr>
    <th>Ngày</th><th>Loại</th><th>Dự án</th><th>Nội dung</th><th>Diễn giải</th><th>Thành tiền</th><th>Hóa đơn</th><th>Chuyển khoản</th><th></th>
  </tr></thead><tbody>${rows.map(t=>`
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td>${t.type==='IN' ? '<span class="tag tag-in">Thu</span>' : '<span class="tag tag-out">Chi</span>'}</td>
      <td>${escapeHtml(t.projectName||'—')}</td>
      <td><strong>${escapeHtml(t.content)}</strong>${t.code? ' <span class="tag tag-gray">'+escapeHtml(t.code)+'</span>':''}</td>
      <td>${escapeHtml(t.description||'—')}</td>
      <td class="num" style="color:${t.type==='IN'?'var(--teal)':'var(--red)'}"><strong>${fmtVND(t.amount)}</strong></td>
      <td>${t.invoiceNumber ? '<span class="tag tag-gold">'+escapeHtml(t.invoiceNumber)+'</span>' : '—'}</td>
      <td>${t.bankAccount ? '<span class="tag tag-blue">'+escapeHtml(t.bankName||'')+'</span>' : '—'}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-edit-tx="${t.id}" title="Sửa">✎</button>
          ${isAdmin() ? `<button class="icon-btn" data-del-tx="${t.id}" title="Xóa">🗑</button>` : ''}
        </div>
      </td>
    </tr>`).join('')}</tbody>`;
}

document.getElementById('tx-table').addEventListener('click', (e)=>{
  const editId = e.target.closest('[data-edit-tx]')?.dataset.editTx;
  const delId = e.target.closest('[data-del-tx]')?.dataset.delTx;
  if(editId) openTxModal(editId);
  if(delId){
    if(confirmDelete('Xóa giao dịch này?')){
      db.collection('transactions').doc(delId).delete().then(()=>toast('Đã xóa giao dịch'));
    }
  }
});

['tx-filter-project','tx-filter-type','tx-filter-month'].forEach(id=>{
  document.getElementById(id).addEventListener('change', renderTxTable);
});
document.getElementById('tx-search').addEventListener('input', renderTxTable);
