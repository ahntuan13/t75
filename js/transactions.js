// =============================================================
// TRANSACTIONS (THU CHI) MODULE
// =============================================================

let TRANSACTIONS = []; // cache
let currentTxType = ''; // '' = chưa chọn Thu/Chi (bắt buộc chọn trước khi hiện các trường)
let currentInvoiceImage = '';
let currentTransferImage = '';
let currentInvoiceStatus = 'pending';
let currentTransferStatus = 'pending';

function setInvoiceStatus(status){
  currentInvoiceStatus = status;
  document.getElementById('seg-invoice-yes').className = status==='issued' ? 'active-gold' : '';
  document.getElementById('seg-invoice-no').className = status==='pending' ? 'active-gray' : '';
}
document.getElementById('seg-invoice-yes').addEventListener('click', ()=> setInvoiceStatus('issued'));
document.getElementById('seg-invoice-no').addEventListener('click', ()=> setInvoiceStatus('pending'));

function setTransferStatus(status){
  currentTransferStatus = status;
  document.getElementById('seg-transfer-yes').className = status==='done' ? 'active-gold' : '';
  document.getElementById('seg-transfer-no').className = status==='pending' ? 'active-gray' : '';
}
document.getElementById('seg-transfer-yes').addEventListener('click', ()=> setTransferStatus('done'));
document.getElementById('seg-transfer-no').addEventListener('click', ()=> setTransferStatus('pending'));

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
    renderApprovalBanner();
  }, (err)=> console.error('tx listen error', err));
}

// ---------------- Thông báo "chờ duyệt" cho GĐ/PGĐ khi đăng nhập ----------------
function renderApprovalBanner(){
  const box = document.getElementById('approval-banner');
  if(!box || !auth.currentUser) return;
  const myEmail = (auth.currentUser.email || '').toLowerCase();
  const pending = TRANSACTIONS.filter(t=> t.type==='OUT' && t.approvalStatus==='pending' && t.approverEmail && t.approverEmail.toLowerCase()===myEmail);
  if(pending.length === 0){
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  const totalAmount = pending.reduce((s,t)=>s+Number(t.amount||0),0);
  box.className = 'approval-banner';
  box.style.display = 'flex';
  box.innerHTML = `<span>🔔 Bạn có <strong>${pending.length}</strong> khoản Chi (tổng ${fmtVND(totalAmount)}) đang chờ bạn duyệt.</span>
    <button class="btn btn-primary btn-sm" id="approval-banner-goto">Xem ngay</button>`;
  document.getElementById('approval-banner-goto').addEventListener('click', ()=>{
    document.querySelector('[data-view="transactions"]')?.click();
  });
}

function setTxType(type){
  currentTxType = type;
  document.getElementById('seg-in').className = type==='IN' ? 'active-in' : '';
  document.getElementById('seg-out').className = type==='OUT' ? 'active-out' : '';
  const fields = document.getElementById('tx-form-fields');
  const hint = document.getElementById('tx-type-hint');
  if(!type){
    fields.style.display = 'none';
    hint.style.display = '';
    return;
  }
  fields.style.display = '';
  hint.style.display = 'none';

  // Nhãn động: Thu (IN) nói về "nhận tiền", Chi (OUT) nói về "chuyển khoản"
  const transferYesBtn = document.getElementById('seg-transfer-yes');
  const transferNoBtn = document.getElementById('seg-transfer-no');
  const transferStatusLabel = document.getElementById('tx-transfer-status-label');
  const transferSectionLabel = document.getElementById('tx-transfer-section-label');
  if(type === 'IN'){
    transferYesBtn.textContent = '✅ Đã nhận tiền';
    transferNoBtn.textContent = '⏳ Chưa nhận tiền';
    transferStatusLabel.textContent = 'Trạng thái nhận tiền';
    transferSectionLabel.textContent = '🏦 Thông tin nhận tiền';
  } else {
    transferYesBtn.textContent = '✅ Đã chuyển khoản';
    transferNoBtn.textContent = '⏳ Chưa chuyển khoản';
    transferStatusLabel.textContent = 'Trạng thái chuyển khoản';
    transferSectionLabel.textContent = '🏦 Thông tin chuyển khoản';
  }

  // Khối gửi duyệt GĐ/PGĐ chỉ áp dụng cho khoản Chi
  document.getElementById('tx-approval-block').style.display = type==='OUT' ? '' : 'none';
}
document.getElementById('seg-in').addEventListener('click', ()=> setTxType('IN'));
document.getElementById('seg-out').addEventListener('click', ()=> setTxType('OUT'));

function openTxModal(id){
  document.getElementById('tx-modal-title').textContent = id ? 'Sửa giao dịch' : 'Nhập giao dịch thu chi';
  document.getElementById('tx-id').value = id || '';
  const t = id ? TRANSACTIONS.find(x=>x.id===id) : {};
  setTxType(id ? (t.type || 'IN') : ''); // giao dịch mới: chưa chọn Thu/Chi, bắt buộc chọn trước
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
  setInvoiceStatus(t.invoiceStatus || 'pending');
  setTransferStatus(t.transferStatus || 'pending');
  // Khối gửi duyệt: chỉ để trống chọn khi CHƯA đang chờ duyệt — tránh vô tình gửi lại/resét khi chỉ sửa field khác
  document.getElementById('tx-approval-target').value = t.approvalStatus==='pending' ? (t.approverRole||'') : '';
  renderApprovalCurrentStatus(t);
  openModal('modal-tx');
}

function renderApprovalCurrentStatus(t){
  const el = document.getElementById('tx-approval-current-status');
  if(!el) return;
  const roleLabel = 'Giám đốc';
  if(!t.approvalStatus || t.approvalStatus==='none'){ el.textContent = 'Chưa gửi duyệt.'; return; }
  if(t.approvalStatus==='pending') el.innerHTML = `🟡 Đang chờ ${roleLabel} (${escapeHtml(t.approverEmail||'')}) duyệt.`;
  else if(t.approvalStatus==='approved') el.innerHTML = `✅ Đã được ${roleLabel} duyệt (${escapeHtml(t.approvedBy||'')}).`;
  else if(t.approvalStatus==='rejected') el.innerHTML = `❌ Đã bị ${roleLabel} từ chối (${escapeHtml(t.approvedBy||'')}).`;
}

document.getElementById('btn-add-tx').addEventListener('click', ()=> openTxModal(null));

// auto-calc thành tiền = SL * đơn giá (nếu có đơn giá; SL bỏ trống mặc định tính là 1)
document.getElementById('tx-unitprice').addEventListener('input', ()=>{
  formatMoneyInput(document.getElementById('tx-unitprice'));
  const qty = Number(document.getElementById('tx-qty').value) || 1;
  const price = parseMoneyInput(document.getElementById('tx-unitprice'));
  if(price) setMoneyInputValue(document.getElementById('tx-amount'), qty*price);
});
document.getElementById('tx-qty').addEventListener('input', ()=>{
  const qty = Number(document.getElementById('tx-qty').value) || 1;
  const price = parseMoneyInput(document.getElementById('tx-unitprice'));
  if(price) setMoneyInputValue(document.getElementById('tx-amount'), qty*price);
});
document.getElementById('tx-amount').addEventListener('input', ()=> formatMoneyInput(document.getElementById('tx-amount')));

document.getElementById('save-tx-btn').addEventListener('click', async ()=>{
  const id = document.getElementById('tx-id').value;
  const projectId = document.getElementById('tx-project').value;
  const content = document.getElementById('tx-content').value.trim();
  const date = document.getElementById('tx-date').value;
  const amount = parseMoneyInput(document.getElementById('tx-amount'));
  if(!currentTxType){ toast('Vui lòng chọn Thu hoặc Chi'); return; }
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
    invoiceStatus: currentInvoiceStatus,
    transferStatus: currentTransferStatus,
  };

  // Gửi duyệt GĐ/PGĐ (chỉ áp dụng cho khoản Chi, và chỉ khi người dùng chủ động chọn ở dropdown)
  if(currentTxType === 'OUT'){
    const approvalTarget = document.getElementById('tx-approval-target').value; // '' hoặc 'GD'
    if(approvalTarget){
      const approverEmail = APPROVERS.gdEmail || '';
      if(!approverEmail){
        toast('Chưa cài đặt email Giám đốc — vào mục Người dùng để nhập trước.');
        return;
      }
      data.approvalStatus = 'pending';
      data.approverRole = approvalTarget;
      data.approverEmail = approverEmail;
      data.approvalSubmittedAt = firebase.firestore.FieldValue.serverTimestamp();
      data.approvedBy = '';
      data.approvedAt = '';
    }
  }

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
  const code = document.getElementById('tx-filter-code').value;
  const month = document.getElementById('tx-filter-month').value;
  const search = document.getElementById('tx-search').value.trim().toLowerCase();
  return TRANSACTIONS.filter(t=>{
    if(project && t.projectId!==project) return false;
    if(type && t.type!==type) return false;
    if(code && t.code!==code) return false;
    if(month && monthKey(t.date)!==month) return false;
    if(search && !(`${t.content} ${t.description} ${t.code}`.toLowerCase().includes(search))) return false;
    return true;
  });
}

function txRowHtml(t){
  const invoiceDone = (t.invoiceStatus||'pending')==='issued';
  const transferDone = (t.transferStatus||'pending')==='done';
  const transferDoneLabel = t.type==='IN' ? 'Đã nhận' : 'Đã CK';
  const transferPendingLabel = t.type==='IN' ? 'Chưa nhận' : 'Chưa CK';

  let approvalCell = '—';
  if(t.type === 'OUT'){
    const myEmail = (auth.currentUser && auth.currentUser.email || '').toLowerCase();
    const status = t.approvalStatus || 'none';
    if(status === 'pending'){
      approvalCell = `<span class="tag tag-gray">🟡 Chờ GĐ</span>`;
      if(myEmail && t.approverEmail && myEmail === t.approverEmail.toLowerCase()){
        approvalCell += ` <button class="icon-btn" data-approve-tx="${t.id}" title="Duyệt">✅</button><button class="icon-btn" data-reject-tx="${t.id}" title="Từ chối">❌</button>`;
      }
    } else if(status === 'approved'){
      approvalCell = '<span class="tag tag-gold">✅ Đã duyệt</span>';
    } else if(status === 'rejected'){
      approvalCell = '<span class="tag tag-out">❌ Từ chối</span>';
    } else {
      approvalCell = '<span class="tag tag-gray">—</span>';
    }
  }

  return `<tr>
      <td>${fmtDate(t.date)}</td>
      <td>${t.type==='IN' ? '<span class="tag tag-in">Thu</span>' : '<span class="tag tag-out">Chi</span>'}</td>
      <td><strong>${escapeHtml(t.content)}</strong>${t.code? ' <span class="tag tag-gray">'+escapeHtml(t.code)+'</span>':''}</td>
      <td>${escapeHtml(t.description||'—')}</td>
      <td class="num" style="color:${t.type==='IN'?'var(--teal)':'var(--red)'}"><strong>${fmtVND(t.amount)}</strong></td>
      <td>${invoiceDone ? '<span class="tag tag-gold">✅ '+(t.invoiceNumber?escapeHtml(t.invoiceNumber):'Đã xuất')+'</span>' : '<span class="tag tag-gray">⏳ Chưa xuất</span>'}</td>
      <td>${transferDone ? '<span class="tag tag-gold">✅ '+transferDoneLabel+'</span>' : '<span class="tag tag-gray">⏳ '+transferPendingLabel+'</span>'}</td>
      <td>${approvalCell}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-view-tx="${t.id}" title="Xem chi tiết">👁</button>
          ${isAdmin() ? `<button class="icon-btn" data-edit-tx="${t.id}" title="Sửa">✎</button>` : ''}
          ${isAdmin() ? `<button class="icon-btn" data-del-tx="${t.id}" title="Xóa">🗑</button>` : ''}
        </div>
      </td>
    </tr>`;
}

// ---------------- Duyệt chi (GĐ/PGĐ) — dùng chung cho bảng + modal xem chi tiết ----------------
async function decideApproval(id, decision){
  const t = TRANSACTIONS.find(x=>x.id===id);
  if(!t) return;
  const label = decision==='approved' ? 'DUYỆT' : 'TỪ CHỐI';
  if(!confirm(`Xác nhận ${label} khoản chi "${t.content}" — ${fmtVND(t.amount)}?`)) return;
  try{
    await db.collection('transactions').doc(id).update({
      approvalStatus: decision,
      approvedBy: auth.currentUser.email,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    toast(decision==='approved' ? 'Đã duyệt khoản chi' : 'Đã từ chối khoản chi');
  }catch(err){ toast('Lỗi: '+err.message); }
}

async function submitForApproval(id, role){
  const approverEmail = APPROVERS.gdEmail || '';
  if(!approverEmail){
    toast('Chưa cài đặt email Giám đốc — vào mục Người dùng để nhập trước.');
    return;
  }
  try{
    await db.collection('transactions').doc(id).update({
      approvalStatus: 'pending', approverRole: role, approverEmail,
      approvalSubmittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: '', approvedAt: '',
    });
    toast('Đã gửi duyệt');
  }catch(err){ toast('Lỗi: '+err.message); }
}

function renderTxTable(){
  const wrap = document.getElementById('tx-table');
  if(!wrap) return;
  const rows = getFilteredTx();
  if(rows.length===0){
    wrap.innerHTML = `<div class="card"><div class="empty-state"><div class="big">⇄</div>Chưa có giao dịch nào phù hợp bộ lọc.</div></div>`;
    return;
  }

  // Nhóm theo dự án: mỗi dự án 1 khung riêng, Thu nằm trên, Chi nằm dưới
  const groups = {};
  const order = [];
  rows.forEach(t=>{
    const key = t.projectId || '__none__';
    if(!groups[key]){
      groups[key] = {name: t.projectName || 'Không thuộc dự án', items: []};
      order.push(key);
    }
    groups[key].items.push(t);
  });
  // sắp xếp các khung dự án theo tên A-Z cho dễ tra cứu
  order.sort((a,b)=> groups[a].name.localeCompare(groups[b].name, 'vi'));

  const theadHtml = `<thead><tr>
    <th>Ngày</th><th>Loại</th><th>Nội dung</th><th>Diễn giải</th><th>Thành tiền</th><th>Hóa đơn</th><th>CK / Nhận tiền</th><th>Duyệt chi</th><th></th>
  </tr></thead>`;

  wrap.innerHTML = order.map(key=>{
    const g = groups[key];
    const items = [...g.items].sort((a,b)=> (b.date||'').localeCompare(a.date||''));
    const sumIn = items.filter(t=>t.type==='IN').reduce((s,t)=>s+Number(t.amount||0),0);
    const sumOut = items.filter(t=>t.type==='OUT').reduce((s,t)=>s+Number(t.amount||0),0);
    return `
    <div class="card tx-project-block">
      <div class="tx-project-head">
        <h4>${escapeHtml(g.name)}</h4>
        <div class="tx-project-summary">
          <span style="color:var(--teal)">Thu: <strong>${fmtVND(sumIn)}</strong></span>
          <span style="color:var(--red)">Chi: <strong>${fmtVND(sumOut)}</strong></span>
          <span>Chênh lệch: <strong>${fmtVND(sumIn-sumOut)}</strong></span>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data">
          ${theadHtml}
          <tbody>${items.map(txRowHtml).join('')}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

function openTxViewModal(id){
  const t = TRANSACTIONS.find(x=>x.id===id);
  if(!t) return;
  const row = (label, value) => value ? `<dt>${label}</dt><dd>${value}</dd>` : '';
  let html = `<dl class="tx-view-grid">
    ${row('Loại giao dịch', t.type==='IN' ? '<span class="tag tag-in">Thu</span>' : '<span class="tag tag-out">Chi</span>')}
    ${row('Dự án', escapeHtml(t.projectName||'—'))}
    ${row('Ngày', fmtDate(t.date))}
    ${row('Mã (code)', t.code ? escapeHtml(t.code) : '')}
    ${row('Nội dung', '<strong>'+escapeHtml(t.content||'')+'</strong>')}
    ${row('Diễn giải', escapeHtml(t.description||''))}
    ${row('ĐVT', escapeHtml(t.unit||''))}
    ${row('Số lượng', t.qty ? String(t.qty) : '')}
    ${row('Đơn giá', t.unitPrice ? fmtVND(t.unitPrice) : '')}
    ${row('Thành tiền', '<strong style="color:'+(t.type==='IN'?'var(--teal)':'var(--red)')+'">'+fmtVND(t.amount)+'</strong>')}
  </dl>`;

  // Trạng thái hóa đơn — bất kỳ ai đăng nhập cũng bấm đổi được (không cần quyền Admin)
  const invoiceIssued = (t.invoiceStatus||'pending')==='issued';
  html += `<div class="tx-view-section"><h5>🧾 Thông tin hóa đơn</h5>
    <div class="seg tx-status-toggle" style="max-width:340px;">
      <button type="button" class="${invoiceIssued?'active-gold':''}" data-status-toggle="invoiceStatus" data-status-value="issued" data-tx-id="${t.id}">✅ Đã xuất hóa đơn</button>
      <button type="button" class="${!invoiceIssued?'active-gray':''}" data-status-toggle="invoiceStatus" data-status-value="pending" data-tx-id="${t.id}">⏳ Chưa xuất hóa đơn</button>
    </div>
    <dl class="tx-view-grid" style="margin-top:10px;">
      ${row('Số hóa đơn', escapeHtml(t.invoiceNumber||''))}
      ${row('Ngày hóa đơn', t.invoiceDate ? fmtDate(t.invoiceDate) : '')}
    </dl>${t.invoiceImage ? `<div class="tx-view-images"><img src="${t.invoiceImage}" data-lightbox="${t.invoiceImage}"></div>` : ''}</div>`;

  // Trạng thái CK/nhận tiền — nhãn động theo Thu/Chi, ai cũng đổi được
  const transferDone = (t.transferStatus||'pending')==='done';
  const doneLabel = t.type==='IN' ? '✅ Đã nhận tiền' : '✅ Đã chuyển khoản';
  const pendingLabel = t.type==='IN' ? '⏳ Chưa nhận tiền' : '⏳ Chưa chuyển khoản';
  const sectionTitle = t.type==='IN' ? '🏦 Thông tin nhận tiền' : '🏦 Thông tin chuyển khoản';
  html += `<div class="tx-view-section"><h5>${sectionTitle}</h5>
    <div class="seg tx-status-toggle" style="max-width:340px;">
      <button type="button" class="${transferDone?'active-gold':''}" data-status-toggle="transferStatus" data-status-value="done" data-tx-id="${t.id}">${doneLabel}</button>
      <button type="button" class="${!transferDone?'active-gray':''}" data-status-toggle="transferStatus" data-status-value="pending" data-tx-id="${t.id}">${pendingLabel}</button>
    </div>
    <dl class="tx-view-grid" style="margin-top:10px;">
      ${row('Ngân hàng', escapeHtml(t.bankName||''))}
      ${row('Số tài khoản', escapeHtml(t.bankAccount||''))}
      ${row('Tên chủ TK', escapeHtml(t.bankHolder||''))}
      ${row('Ngày chuyển khoản', t.transferDate ? fmtDate(t.transferDate) : '')}
    </dl>${t.transferImage ? `<div class="tx-view-images"><img src="${t.transferImage}" data-lightbox="${t.transferImage}"></div>` : ''}</div>`;

  if(t.type === 'OUT'){
    html += renderApprovalSectionHtml(t);
  }

  if(t.note){
    html += `<div class="tx-view-section"><h5>📝 Ghi chú</h5><div class="tx-view-note">${escapeHtml(t.note)}</div></div>`;
  }

  document.getElementById('tx-view-body').innerHTML = html;
  document.getElementById('tx-view-edit-btn').dataset.editTx = t.id;
  document.getElementById('tx-view-edit-btn').style.display = isAdmin() ? '' : 'none';
  openModal('modal-tx-view');
}

function renderApprovalSectionHtml(t){
  const myEmail = (auth.currentUser && auth.currentUser.email || '').toLowerCase();
  const status = t.approvalStatus || 'none';
  const roleLabel = 'Giám đốc';
  let statusHtml;
  if(status==='pending') statusHtml = `<span class="tag tag-gray">🟡 Đang chờ ${roleLabel} (${escapeHtml(t.approverEmail||'')}) duyệt</span>`;
  else if(status==='approved') statusHtml = `<span class="tag tag-gold">✅ Đã duyệt bởi ${escapeHtml(t.approvedBy||'')}</span>`;
  else if(status==='rejected') statusHtml = `<span class="tag tag-out">❌ Từ chối bởi ${escapeHtml(t.approvedBy||'')}</span>`;
  else statusHtml = `<span class="tag tag-gray">Chưa gửi duyệt</span>`;

  let actions = '';
  if(status==='pending' && myEmail && t.approverEmail && myEmail===t.approverEmail.toLowerCase()){
    actions = `<div style="margin-top:10px;display:flex;gap:8px;">
      <button class="btn btn-primary btn-sm" data-approve-tx="${t.id}">✅ Duyệt</button>
      <button class="btn btn-ghost btn-sm" data-reject-tx="${t.id}">❌ Từ chối</button>
    </div>`;
  } else if(status !== 'pending'){
    actions = `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-ghost btn-sm" data-submit-approval="${t.id}" data-role="GD">Gửi Giám đốc duyệt</button>
    </div>`;
  }
  return `<div class="tx-view-section"><h5>✅ Phê duyệt GĐ / PGĐ</h5>${statusHtml}${actions}</div>`;
}

document.getElementById('tx-view-edit-btn').addEventListener('click', (e)=>{
  const id = e.target.dataset.editTx;
  closeModal('modal-tx-view');
  openTxModal(id);
});

document.getElementById('tx-view-body').addEventListener('click', async (e)=>{
  const src = e.target.closest('[data-lightbox]')?.dataset.lightbox;
  if(src){ window.open(src, '_blank'); return; }

  const toggleBtn = e.target.closest('[data-status-toggle]');
  if(toggleBtn){
    const field = toggleBtn.dataset.statusToggle;
    const value = toggleBtn.dataset.statusValue;
    const id = toggleBtn.dataset.txId;
    try{
      await db.collection('transactions').doc(id).update({ [field]: value });
      toast('Đã cập nhật trạng thái');
      openTxViewModal(id);
    }catch(err){ toast('Lỗi: '+err.message); }
    return;
  }

  const approveBtn = e.target.closest('[data-approve-tx]');
  if(approveBtn){ await decideApproval(approveBtn.dataset.approveTx, 'approved'); openTxViewModal(approveBtn.dataset.approveTx); return; }

  const rejectBtn = e.target.closest('[data-reject-tx]');
  if(rejectBtn){ await decideApproval(rejectBtn.dataset.rejectTx, 'rejected'); openTxViewModal(rejectBtn.dataset.rejectTx); return; }

  const submitBtn = e.target.closest('[data-submit-approval]');
  if(submitBtn){
    const id = submitBtn.dataset.submitApproval;
    const role = submitBtn.dataset.role;
    await submitForApproval(id, role);
    openTxViewModal(id);
  }
});

document.getElementById('tx-table').addEventListener('click', (e)=>{
  const viewId = e.target.closest('[data-view-tx]')?.dataset.viewTx;
  const editId = e.target.closest('[data-edit-tx]')?.dataset.editTx;
  const delId = e.target.closest('[data-del-tx]')?.dataset.delTx;
  const approveId = e.target.closest('[data-approve-tx]')?.dataset.approveTx;
  const rejectId = e.target.closest('[data-reject-tx]')?.dataset.rejectTx;
  if(viewId) openTxViewModal(viewId);
  if(editId) openTxModal(editId);
  if(delId){
    if(confirmDelete('Xóa giao dịch này?')){
      db.collection('transactions').doc(delId).delete().then(()=>toast('Đã xóa giao dịch'));
    }
  }
  if(approveId) decideApproval(approveId, 'approved');
  if(rejectId) decideApproval(rejectId, 'rejected');
});

['tx-filter-project','tx-filter-type','tx-filter-code','tx-filter-month'].forEach(id=>{
  document.getElementById(id).addEventListener('change', renderTxTable);
});
document.getElementById('tx-search').addEventListener('input', renderTxTable);
