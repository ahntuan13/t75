// =============================================================
// TRANSACTIONS (THU CHI) MODULE
// =============================================================

let TRANSACTIONS = []; // cache

// Thu Chi "đang thực tính" — loại bỏ các khoản tạm ứng ĐÃ GIẢI CHI (số liệu chính thức nằm ở nơi khác,
// tránh tính trùng). Dùng hàm này ở MỌI nơi cần tính tổng Thu Chi (Dashboard/Báo cáo/chính trang Thu Chi).
function activeTransactions(){
  return TRANSACTIONS.filter(t =>
    t.advanceExplainStatus !== 'explained' &&
    // Khoản Chi đang "Chờ duyệt" hoặc "Từ chối" thì CHƯA được tính — phải Duyệt xong mới cộng vào tổng.
    !(t.type==='OUT' && (t.approvalStatus==='pending' || t.approvalStatus==='rejected'))
  );
}
let currentTxType = ''; // '' = chưa chọn Thu/Chi (bắt buộc chọn trước khi hiện các trường)
let currentInvoiceImage = '';
let currentTransferImage = '';
let currentInvoiceStatus = 'pending';
let currentTransferStatus = 'pending';

// ---------------- Loại "Hóa Đơn" — nhiều dòng hàng hóa/dịch vụ theo đúng mẫu hóa đơn VAT ----------------
let isInvoiceTxMode = false; // true khi đang chọn loại "🧾 Hóa Đơn" ở Nhập giao dịch
let invoiceItemRows = []; // mảng các dòng: {name, unit, qty, unitPrice, amount, vatRate, vatAmount, amountAfterTax}
let invoiceItemSeq = 0; // id tăng dần cho từng dòng, tránh trùng id DOM khi thêm/xóa liên tục

function newInvoiceItemRow(prefill){
  invoiceItemSeq++;
  return Object.assign({
    _id: invoiceItemSeq, name:'', unit:'', qty:1, unitPrice:0, amount:0, vatRate:0, vatAmount:0, amountAfterTax:0,
  }, prefill || {});
}

function recalcInvoiceItemRow(row){
  row.amount = (Number(row.qty)||0) * (Number(row.unitPrice)||0);
  row.vatAmount = Math.round(row.amount * (Number(row.vatRate)||0) / 100);
  row.amountAfterTax = row.amount + row.vatAmount;
}

function renderInvoiceItemRows(){
  const wrap = document.getElementById('tx-invoice-items-list');
  if(!wrap) return;
  wrap.innerHTML = invoiceItemRows.map((row)=> `
    <tr data-row-id="${row._id}">
      <td><input data-field="name" data-row-id="${row._id}" value="${escapeHtml(row.name)}" placeholder="VD: Xi măng Hà Tiên PC40"></td>
      <td><input data-field="unit" data-row-id="${row._id}" value="${escapeHtml(row.unit)}" placeholder="lot, cái..."></td>
      <td><input type="number" data-field="qty" data-row-id="${row._id}" value="${row.qty}" style="width:60px;"></td>
      <td><input type="text" class="money-input" data-field="unitPrice" data-row-id="${row._id}" value="${row.unitPrice ? fmtNum(row.unitPrice) : ''}" placeholder="0"></td>
      <td class="num">${fmtNum(row.amount)}</td>
      <td><input type="number" data-field="vatRate" data-row-id="${row._id}" value="${row.vatRate}" placeholder="0" style="width:56px;">%</td>
      <td class="num">${fmtNum(row.vatAmount)}</td>
      <td class="num"><strong>${fmtNum(row.amountAfterTax)}</strong></td>
      <td>${invoiceItemRows.length>1 ? `<button type="button" class="icon-btn" data-remove-row="${row._id}" title="Xóa dòng">🗑</button>` : ''}</td>
    </tr>`).join('');

  const totalAmount = invoiceItemRows.reduce((s,r)=> s + r.amount, 0);
  const totalVat = invoiceItemRows.reduce((s,r)=> s + r.vatAmount, 0);
  const totalAfterTax = invoiceItemRows.reduce((s,r)=> s + r.amountAfterTax, 0);
  document.getElementById('tx-inv-total-amount').textContent = fmtNum(totalAmount);
  document.getElementById('tx-inv-total-vat').textContent = fmtNum(totalVat);
  document.getElementById('tx-inv-total-after-tax').textContent = fmtNum(totalAfterTax);
  setMoneyInputValue(document.getElementById('tx-amount'), totalAfterTax);
}

document.getElementById('tx-invoice-items-list')?.addEventListener('input', (e)=>{
  const rowId = Number(e.target.dataset.rowId);
  const field = e.target.dataset.field;
  if(!rowId || !field) return;
  const row = invoiceItemRows.find(r=> r._id===rowId);
  if(!row) return;
  if(e.target.classList.contains('money-input')) formatMoneyInput(e.target);
  row[field] = (field==='name' || field==='unit') ? e.target.value
    : field==='unitPrice' ? parseMoneyInput(e.target)
    : Number(e.target.value) || 0;
  recalcInvoiceItemRow(row);
  renderInvoiceItemRows();
  // giữ nguyên focus đúng ô đang gõ sau khi render lại (tránh mất con trỏ khi tự tính lại các ô disabled)
  const reFocus = document.querySelector(`[data-row-id="${rowId}"][data-field="${field}"]`);
  if(reFocus){ reFocus.focus(); const v = reFocus.value; reFocus.value=''; reFocus.value=v; }
});
document.getElementById('tx-invoice-items-list')?.addEventListener('click', (e)=>{
  const rowId = Number(e.target.closest('[data-remove-row]')?.dataset.removeRow);
  if(!rowId) return;
  invoiceItemRows = invoiceItemRows.filter(r=> r._id!==rowId);
  renderInvoiceItemRows();
});
document.getElementById('tx-invoice-item-add')?.addEventListener('click', ()=>{
  invoiceItemRows.push(newInvoiceItemRow());
  renderInvoiceItemRows();
});

function setInvoiceTxMode(on){
  isInvoiceTxMode = on;
  const contentField = document.getElementById('tx-content-field');
  if(contentField) contentField.style.display = on ? 'none' : '';
  const invoiceDetailField = document.getElementById('tx-invoice-detail-fields');
  if(invoiceDetailField) invoiceDetailField.style.display = on ? 'none' : '';
  ['tx-simple-unit-field','tx-simple-qty-field','tx-simple-price-field','tx-simple-amount-field'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.style.display = on ? 'none' : '';
  });
  const itemsField = document.getElementById('tx-invoice-items-field');
  if(itemsField) itemsField.style.display = on ? '' : 'none';
  const amountField = document.getElementById('tx-simple-amount-field');
  // Khi ở chế độ Hóa Đơn, "Thành tiền" tổng vẫn tồn tại ẩn (dùng chung field tx-amount để lưu tổng),
  // chỉ ẩn input hiển thị đơn lẻ đi vì đã có tổng hiển thị riêng trong khối nhiều dòng.
  if(on && invoiceItemRows.length===0){
    invoiceItemRows = [newInvoiceItemRow()];
  }
  if(on) renderInvoiceItemRows();
}

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

// ---------------- Tự tính "Thành tiền sau thuế" = Thành tiền + Tiền thuế GTGT (Thu/Chi/Tạm ứng — không phải chế độ Hóa Đơn) ----------------
function recalcTxInvoiceTotal(){
  const pretax = parseMoneyInput(document.getElementById('tx-pretax-amount'));
  const vat = parseMoneyInput(document.getElementById('tx-vat-amount'));
  if(pretax || vat){
    setMoneyInputValue(document.getElementById('tx-total-amount'), pretax + vat);
  }
}
['tx-pretax-amount','tx-vat-amount'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input', recalcTxInvoiceTotal);
});
document.getElementById('tx-total-amount')?.addEventListener('input', ()=>{
  // Đồng bộ 1 chiều: Thành tiền sau thuế -> Số tiền (dùng trong chế độ Thu/Chi/Tạm ứng thường, không phải Hóa Đơn).
  if(isInvoiceTxMode) return;
  const total = parseMoneyInput(document.getElementById('tx-total-amount'));
  if(total) setMoneyInputValue(document.getElementById('tx-amount'), total);
});

// ---------------- AI quét hóa đơn (ảnh hoặc PDF) cho Thu/Chi/Tạm ứng — dùng chung engine với Hóa Đơn/Lệnh chi ----------------
document.getElementById('tx-scan-invoice-btn')?.addEventListener('click', ()=>{
  document.getElementById('tx-scan-invoice-input').click();
});
document.getElementById('tx-scan-invoice-input')?.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  const btn = document.getElementById('tx-scan-invoice-btn');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  btn.disabled = true; btn.textContent = '⏳ Đang đọc...';
  try{
    let extracted;
    if(isPdf){
      const pdfData = await pdfExtractRows(file);
      if(pdfData){
        const rawText = pdfRowsToText(pdfData.rows);
        extracted = parseInvoiceText(rawText, OCR_SETTINGS.companyName);
        const columnItems = parseItemTableByColumns(pdfData.rows);
        if(columnItems) extracted.items = columnItems;
      } else {
        toast('File PDF này không có lớp chữ thật (dạng scan) — đang đọc bằng OCR...');
        const imgUrl = await pdfFirstPageToImage(file);
        const rawText = await runOcr(imgUrl, (pct)=> btn.textContent = `⏳ Đang đọc chữ... ${pct}%`);
        extracted = parseInvoiceText(rawText, OCR_SETTINGS.companyName);
      }
    } else if(file.type.startsWith('image/')){
      const compressed = await compressImageFile(file, 900, 0.65);
      currentInvoiceImage = compressed; // tiện thể dùng luôn làm "Ảnh hóa đơn" đính kèm, đỡ phải chọn lại file lần nữa
      setImagePreview('invoice', compressed);
      const imgUrl = await compressImageFile(file, 1600, 0.85);
      const rawText = await runOcr(imgUrl, (pct)=> btn.textContent = `⏳ Đang đọc chữ... ${pct}%`);
      extracted = parseInvoiceText(rawText, OCR_SETTINGS.companyName);
    } else {
      toast('Chỉ quét được file ảnh hoặc PDF.');
      return;
    }

    if(extracted.invoiceNumber) document.getElementById('tx-invoice-number').value = extracted.invoiceNumber;
    if(extracted.invoiceDate) document.getElementById('tx-invoice-date').value = extracted.invoiceDate;
    if(extracted.sellerTaxCode) document.getElementById('tx-invoice-tax-code').value = extracted.sellerTaxCode;
    const items = extracted.items || [];
    const pretax = items.reduce((s,it)=> s + (it.amount||0), 0);
    const vat = items.reduce((s,it)=> s + (it.vatAmount||0), 0);
    const total = items.reduce((s,it)=> s + (it.amountAfterTax || it.amount || 0), 0) || extracted.totalAmount || 0;
    if(pretax) setMoneyInputValue(document.getElementById('tx-pretax-amount'), pretax);
    if(vat) setMoneyInputValue(document.getElementById('tx-vat-amount'), vat);
    if(total) setMoneyInputValue(document.getElementById('tx-total-amount'), total);
    if(total && !isInvoiceTxMode) setMoneyInputValue(document.getElementById('tx-amount'), total);
    toast('✅ Đã đọc xong — kiểm tra KỸ lại thông tin (MST, số tiền, số hóa đơn) trước khi lưu.');
  }catch(err){
    toast('Lỗi đọc file: ' + err.message);
  }finally{
    btn.disabled = false; btn.textContent = '🔍 Quét hóa đơn (AI)';
  }
});

function listenTransactions(){
  let autoBackupChecked = false;
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
    if(window.renderNotifications) renderNotifications();
    // Chỉ kiểm tra sao lưu tự động 1 LẦN mỗi phiên, ngay khi dữ liệu Thu Chi vừa tải xong lần đầu.
    if(!autoBackupChecked){
      autoBackupChecked = true;
      if(typeof checkAutoBackup==='function') checkAutoBackup();
    }
  }, (err)=> console.error('tx listen error', err));
}

// ---------------- Thông báo "chờ duyệt" cho GĐ/PGĐ khi đăng nhập ----------------
function renderApprovalBanner(){
  const box = document.getElementById('approval-banner');
  if(!box || !auth.currentUser) return;
  const myEmail = (auth.currentUser.email || '').toLowerCase();
  const pendingTx = TRANSACTIONS.filter(t=> t.type==='OUT' && t.approvalStatus==='pending' && isAuthorizedApprover(myEmail));
  const allPendingOrders = (typeof ORDERS!=='undefined' ? ORDERS : []).filter(o=> o.approvalStatus==='pending' && isAuthorizedApprover(myEmail));
  const isAdv = (typeof isAdvanceOrder==='function') ? isAdvanceOrder : ()=>false;
  const pendingPaymentOrders = allPendingOrders.filter(o=> !isAdv(o));
  const pendingAdvanceOrders = allPendingOrders.filter(o=> isAdv(o));
  const totalCount = pendingTx.length + allPendingOrders.length;
  if(totalCount === 0){
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  const totalAmount = pendingTx.reduce((s,t)=>s+Number(t.amount||0),0) + allPendingOrders.reduce((s,o)=>s+Number(o.amount||0),0);
  const lines = [];
  if(pendingTx.length) lines.push(`<div>🔔 Bạn có <strong>${pendingTx.length} khoản</strong> cần duyệt trong mục <strong>Thu Chi</strong>. <button class="btn btn-ghost btn-sm" data-goto-approval="transactions">Xem ngay</button></div>`);
  if(pendingPaymentOrders.length) lines.push(`<div>🔔 Bạn có <strong>${pendingPaymentOrders.length} lệnh chi</strong> cần duyệt trong mục <strong>Lệnh chi</strong>. <button class="btn btn-ghost btn-sm" data-goto-approval="orders">Xem ngay</button></div>`);
  if(pendingAdvanceOrders.length) lines.push(`<div>🔔 Bạn có <strong>${pendingAdvanceOrders.length} tạm ứng</strong> cần duyệt trong mục <strong>Lệnh tạm ứng</strong>. <button class="btn btn-ghost btn-sm" data-goto-approval="advance">Xem ngay</button></div>`);
  box.className = 'approval-banner';
  box.style.display = 'flex';
  box.style.flexDirection = 'column';
  box.style.alignItems = 'flex-start';
  box.style.gap = '6px';
  box.innerHTML = `<div style="font-size:11.5px;color:var(--ink-faint);margin-bottom:2px;">Tổng ${fmtVND(totalAmount)} đang chờ bạn duyệt:</div>` + lines.join('');
  box.querySelectorAll('[data-goto-approval]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelector(`[data-view="${btn.dataset.gotoApproval}"]`)?.click();
    });
  });
}

function setTxType(type){
  currentTxType = type;
  document.getElementById('seg-in').className = type==='IN' ? 'active-in' : '';
  document.getElementById('seg-out').className = (type==='OUT' && !isInvoiceTxMode) ? 'active-out' : '';
  document.getElementById('seg-invoice-type').className = (type==='OUT' && isInvoiceTxMode) ? 'active-gold' : '';
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
document.getElementById('seg-in').addEventListener('click', ()=>{ setInvoiceTxMode(false); setTxType('IN'); });
document.getElementById('seg-out').addEventListener('click', ()=>{ setInvoiceTxMode(false); setTxType('OUT'); });
document.getElementById('seg-invoice-type').addEventListener('click', ()=>{ setInvoiceTxMode(true); setTxType('OUT'); });
document.getElementById('seg-advance')?.addEventListener('click', ()=>{
  closeModal('modal-tx');
  openOrderModal(null, 'advance');
});

let currentTxTarget = 'transactions'; // 'transactions' | 'fixedCosts'
let currentTxExplainSourceId = null; // nếu có: đang "giải trình" 1 khoản tạm ứng từ Chi phí gián tiếp -> chuyển sang Thu Chi

function openTxModal(id, prefill, target, explainSourceId){
  currentTxExplainSourceId = explainSourceId || null;
  currentTxTarget = target || 'transactions';
  const isFc = currentTxTarget === 'fixedCosts';
  const sourceArr = isFc ? (typeof FIXEDCOSTS!=='undefined'?FIXEDCOSTS:[]) : TRANSACTIONS;
  document.getElementById('tx-modal-title').textContent = currentTxExplainSourceId
    ? 'Giải trình tạm ứng → chuyển sang Thu Chi'
    : isFc
      ? (id ? 'Sửa chi phí gián tiếp' : 'Nhập chi phí gián tiếp')
      : (id ? 'Sửa giao dịch' : 'Nhập giao dịch thu chi');
  document.getElementById('tx-id').value = id || '';
  const t = id ? sourceArr.find(x=>x.id===id) : (prefill || {});
  // giao dịch mới không có prefill: chưa chọn Thu/Chi, bắt buộc chọn trước.
  // Có prefill (VD: từ AI đọc hóa đơn) thì tự chọn sẵn đúng loại AI đã xác định được.
  const hasInvoiceItems = Array.isArray(t.invoiceItems) && t.invoiceItems.length > 0;
  invoiceItemRows = hasInvoiceItems ? t.invoiceItems.map(it=> newInvoiceItemRow(it)) : [];
  setInvoiceTxMode(hasInvoiceItems);
  setTxType(id ? (t.type || 'IN') : (prefill ? (prefill.type || 'OUT') : ''));
  document.getElementById('tx-project-field').style.display = isFc ? 'none' : '';
  document.getElementById('tx-project').value = t.projectId || '';
  document.getElementById('tx-date').value = t.date || ((id || prefill) ? '' : todayISO());
  document.getElementById('tx-code').value = t.code || '';
  document.getElementById('tx-content').value = t.content || '';
  document.getElementById('tx-desc').value = t.description || '';
  document.getElementById('tx-unit').value = t.unit || '';
  document.getElementById('tx-qty').value = t.qty || '';
  setMoneyInputValue(document.getElementById('tx-unitprice'), t.unitPrice);
  setMoneyInputValue(document.getElementById('tx-amount'), t.amount);
  document.getElementById('tx-invoice-number').value = t.invoiceNumber || '';
  document.getElementById('tx-invoice-date').value = t.invoiceDate || '';
  document.getElementById('tx-invoice-tax-code').value = t.invoiceTaxCode || '';
  setMoneyInputValue(document.getElementById('tx-pretax-amount'), t.pretaxAmount);
  setMoneyInputValue(document.getElementById('tx-vat-amount'), t.vatAmount);
  setMoneyInputValue(document.getElementById('tx-total-amount'), t.totalAmount);
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
  if(t.approvalStatus==='pending') el.innerHTML = `🟡 Đang chờ 1 trong ${(APPROVERS.approverEmails||[]).length} người duyệt (${escapeHtml((APPROVERS.approverEmails||[]).join(', '))}) xử lý.`;
  else if(t.approvalStatus==='approved') el.innerHTML = `✅ Đã được ${roleLabel} duyệt (${escapeHtml(t.approvedBy||'')}).`;
  else if(t.approvalStatus==='rejected') el.innerHTML = `❌ Đã bị ${roleLabel} từ chối (${escapeHtml(t.approvedBy||'')}).`;
}

document.getElementById('btn-add-tx')?.addEventListener('click', ()=> openTxModal(null));

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
  const isFc = currentTxTarget === 'fixedCosts';
  const id = document.getElementById('tx-id').value;
  const projectId = document.getElementById('tx-project').value;
  const content = isInvoiceTxMode
    ? invoiceItemRows.map(r=>r.name.trim()).filter(Boolean).join(', ') || 'Hóa đơn'
    : document.getElementById('tx-content').value.trim();
  const date = document.getElementById('tx-date').value;
  const amount = parseMoneyInput(document.getElementById('tx-amount'));
  if(!currentTxType){ toast('Vui lòng chọn Thu hoặc Chi'); return; }
  // Không bắt buộc chọn Dự án nữa — cho phép lưu với Dự án để trống (vd chi phí chung không thuộc dự án nào).
  if(!isInvoiceTxMode && !content){ toast('Vui lòng nhập nội dung'); return; }
  if(!date){ toast('Vui lòng chọn ngày'); return; }
  if(!amount){ toast('Vui lòng nhập thành tiền'); return; }
  if(isInvoiceTxMode && !invoiceItemRows.some(r=> r.name.trim())){
    toast('Vui lòng nhập tên ít nhất 1 hàng hóa/dịch vụ');
    return;
  }
  if((currentInvoiceImage.length + currentTransferImage.length) > 900000){
    toast('Ảnh quá lớn, vui lòng chọn ảnh khác hoặc chụp ở độ phân giải thấp hơn');
    return;
  }
  // Đang GIẢI TRÌNH tạm ứng: bắt buộc có Mã + chứng từ hóa đơn và chuyển khoản trước khi chuyển sang Thu Chi
  if(currentTxExplainSourceId){
    const code = document.getElementById('tx-code').value.trim();
    const hasInvoiceProof = document.getElementById('tx-invoice-number').value.trim() || currentInvoiceImage;
    const hasTransferProof = document.getElementById('tx-bank-account').value.trim() || currentTransferImage;
    if(!code){ toast('Vui lòng chọn Mã (code) để giải trình'); return; }
    if(!hasInvoiceProof){ toast('Vui lòng nhập Số hóa đơn hoặc đính kèm ảnh hóa đơn để giải trình'); return; }
    if(!hasTransferProof){ toast('Vui lòng nhập Số tài khoản hoặc đính kèm ảnh chuyển khoản để giải trình'); return; }
  }

  const proj = (!isFc && projectId) ? projectById(projectId) : null;
  const data = {
    type: currentTxType,
    projectId: isFc ? '' : projectId, projectName: isFc ? '' : (proj ? proj.name : ''),
    date, code: document.getElementById('tx-code').value.trim(),
    content, description: document.getElementById('tx-desc').value.trim(),
    unit: isInvoiceTxMode ? '' : document.getElementById('tx-unit').value.trim(),
    qty: isInvoiceTxMode ? 0 : (Number(document.getElementById('tx-qty').value)||0),
    unitPrice: isInvoiceTxMode ? 0 : parseMoneyInput(document.getElementById('tx-unitprice')),
    amount,
    invoiceNumber: document.getElementById('tx-invoice-number').value.trim(),
    invoiceTaxCode: document.getElementById('tx-invoice-tax-code').value.trim(),
    pretaxAmount: parseMoneyInput(document.getElementById('tx-pretax-amount')),
    vatAmount: parseMoneyInput(document.getElementById('tx-vat-amount')),
    totalAmount: parseMoneyInput(document.getElementById('tx-total-amount')),
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

  if(isInvoiceTxMode){
    data.invoiceItems = invoiceItemRows.map(({_id, ...rest})=> rest);
  } else if(id){
    // Sửa 1 giao dịch từng ở chế độ Hóa Đơn nhưng giờ đổi lại Thu/Chi thường -> xóa hẳn field cũ (chỉ hợp lệ khi update).
    data.invoiceItems = firebase.firestore.FieldValue.delete();
  }

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

  const targetCollection = isFc ? 'fixedCosts' : 'transactions';
  try{
    if(id){
      await db.collection(targetCollection).doc(id).update(data);
      toast(isFc ? 'Đã cập nhật chi phí gián tiếp' : 'Đã cập nhật giao dịch');
      logActivity('update', {projectName: data.projectName, content: data.content, amount: data.amount, type: data.type});
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = auth.currentUser.email;
      const newRef = await db.collection(targetCollection).add(data);
      toast(isFc ? 'Đã lưu chi phí gián tiếp' : 'Đã lưu giao dịch');
      logActivity('create', {projectName: data.projectName, content: data.content, amount: data.amount, type: data.type});

      // Nếu đây là bước GIẢI TRÌNH: đánh dấu bản ghi gốc bên Chi phí gián tiếp là "đã giải trình"
      // (không xóa — giữ lại để đối chiếu, chỉ gạch ngang/tô xám và loại khỏi tổng Chi phí gián tiếp).
      if(currentTxExplainSourceId){
        await db.collection('fixedCosts').doc(currentTxExplainSourceId).update({
          advanceExplainStatus: 'explained',
          movedToTransactionId: newRef.id,
          explainedAt: firebase.firestore.FieldValue.serverTimestamp(),
          explainedBy: auth.currentUser.email,
        });
        toast('✅ Đã giải trình xong — khoản chi đã chuyển sang Thu Chi');
      }
    }
    closeModal('modal-tx');
    isInvoiceTxMode = false;
    invoiceItemRows = [];
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
  const isPendingExplain = t.advanceExplainStatus === 'pending';
  const isExplained = t.advanceExplainStatus === 'explained';

  let approvalCell = '—';
  if(t.type === 'OUT'){
    const myEmail = (auth.currentUser && auth.currentUser.email || '').toLowerCase();
    const status = t.approvalStatus || 'none';
    if(status === 'pending'){
      approvalCell = `<span class="tag tag-gray">🟡 Chờ GĐ</span>`;
      if(myEmail && isAuthorizedApprover(myEmail)){
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

  const explainTag = isPendingExplain
    ? ' <span class="tag tag-gold" title="Tạm ứng chưa xác định dự án/chứng từ">🕐 Chờ giải trình</span>'
    : isExplained
      ? ' <span class="tag tag-gray" title="Đã giải trình, xem bản chính thức trong Thu Chi">✅ Đã giải trình → Thu Chi</span>'
      : '';
  const explainBtn = isPendingExplain
    ? `<button class="icon-btn" data-explain-tx="${t.id}" title="Giải trình: gán dự án + chứng từ, chuyển sang Thu Chi">🧾</button>`
    : '';

  return `<tr${isExplained ? ' class="tx-row-explained"' : ''}>
      <td>${fmtDate(t.date)}</td>
      <td>${t.type==='IN' ? '<span class="tag tag-in">Thu</span>' : '<span class="tag tag-out">Chi</span>'}</td>
      <td>${escapeHtml(t.projectName||'—')}</td>
      <td><strong>${escapeHtml((t.content||'').replace(/^Lệnh chi:\s*/i,''))}</strong>${(t.code && t.code!=='LENHCHI')? ' <span class="tag tag-gray">'+escapeHtml(t.code)+'</span>':''}${explainTag}</td>
      <td>${escapeHtml(t.description||'—')}</td>
      <td class="num" style="color:${t.type==='IN'?'var(--teal)':'var(--red)'}"><strong>${fmtVND(t.amount)}</strong></td>
      <td>${invoiceDone ? '<span class="tag tag-gold">✅ '+(t.invoiceNumber?escapeHtml(t.invoiceNumber):'Đã xuất')+'</span>' : '<span class="tag tag-gray">⏳ Chưa xuất</span>'}</td>
      <td>${transferDone ? '<span class="tag tag-gold">✅ '+transferDoneLabel+'</span>' : '<span class="tag tag-gray">⏳ '+transferPendingLabel+'</span>'}</td>
      <td>${approvalCell}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-view-tx="${t.id}" title="Xem chi tiết">👁</button>
          ${explainBtn}
          ${(isAdmin() && !isExplained) ? `<button class="icon-btn" data-edit-tx="${t.id}" title="Sửa">✎</button>` : ''}
          ${(isAdmin() && !isExplained) ? `<button class="icon-btn" data-del-tx="${t.id}" title="Xóa">🗑</button>` : ''}
        </div>
      </td>
    </tr>`;
}

// ---------------- Duyệt chi (GĐ/PGĐ) — dùng chung cho bảng + modal xem chi tiết ----------------
async function decideApproval(id, decision, source){
  const coll = source==='fc' ? 'fixedCosts' : 'transactions';
  const arr = source==='fc' ? (typeof FIXEDCOSTS!=='undefined'?FIXEDCOSTS:[]) : TRANSACTIONS;
  const t = arr.find(x=>x.id===id);
  if(!t) return;
  const label = decision==='approved' ? 'DUYỆT' : 'TỪ CHỐI';
  if(!confirm(`Xác nhận ${label} khoản chi "${t.content}" — ${fmtVND(t.amount)}?`)) return;
  try{
    await db.collection(coll).doc(id).update({
      approvalStatus: decision,
      approvedBy: auth.currentUser.email,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    toast(decision==='approved' ? 'Đã duyệt khoản chi' : 'Đã từ chối khoản chi');
    logActivity('approval_decide', {projectName: t.projectName, content: t.content, amount: t.amount, type: t.type, note: decision==='approved'?'Đã duyệt':'Đã từ chối'});
  }catch(err){ toast('Lỗi: '+err.message); }
}

async function submitForApproval(id, role, source){
  const approverEmail = APPROVERS.gdEmail || '';
  if(!approverEmail){
    toast('Chưa cài đặt email Giám đốc — vào mục Người dùng để nhập trước.');
    return;
  }
  const coll = source==='fc' ? 'fixedCosts' : 'transactions';
  const arr = source==='fc' ? (typeof FIXEDCOSTS!=='undefined'?FIXEDCOSTS:[]) : TRANSACTIONS;
  const t = arr.find(x=>x.id===id);
  try{
    await db.collection(coll).doc(id).update({
      approvalStatus: 'pending', approverRole: role, approverEmail,
      approvalSubmittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: '', approvedAt: '',
    });
    toast('Đã gửi duyệt');
    if(t) logActivity('approval_submit', {projectName: t.projectName, content: t.content, amount: t.amount, type: t.type});
  }catch(err){ toast('Lỗi: '+err.message); }
}

// Dùng chung để dựng 1 khối bảng (card) — tránh lặp code giữa khối "Chờ duyệt" và khối danh sách chính.
function txTableBlockHtml(title, rows, theadHtml, opts={}){
  let summaryHtml = '';
  if(opts.showSummary !== false){
    const activeRows = rows.filter(t =>
      t.advanceExplainStatus !== 'explained' &&
      !(t.type==='OUT' && (t.approvalStatus==='pending' || t.approvalStatus==='rejected'))
    );
    const sumIn = activeRows.filter(t=>t.type==='IN').reduce((s,t)=>s+Number(t.amount||0),0);
    const sumOut = activeRows.filter(t=>t.type==='OUT').reduce((s,t)=>s+Number(t.amount||0),0);
    summaryHtml = `<div class="tx-project-summary">
        <span style="color:var(--teal)">Thu: <strong>${fmtVND(sumIn)}</strong></span>
        <span style="color:var(--red)">Chi: <strong>${fmtVND(sumOut)}</strong></span>
        <span>Chênh lệch: <strong>${fmtVND(sumIn-sumOut)}</strong></span>
      </div>`;
  }
  const bodyHtml = rows.length
    ? `<div class="table-wrap"><table class="data">${theadHtml}<tbody>${rows.map(txRowHtml).join('')}</tbody></table></div>`
    : `<div class="empty-state" style="padding:18px 0;">${opts.emptyText || 'Không có dòng nào.'}</div>`;
  return `
    <div class="card tx-project-block${opts.pendingBlock ? ' tx-pending-block' : ''}">
      <div class="tx-project-head">
        <h4>${title}</h4>
        ${summaryHtml}
      </div>
      ${bodyHtml}
    </div>`;
}

function renderTxTable(){
  const wrap = document.getElementById('tx-table');
  if(!wrap) return;
  const rows = getFilteredTx();
  if(rows.length===0){
    wrap.innerHTML = `<div class="card"><div class="empty-state"><div class="big">⇄</div>Chưa có giao dịch nào phù hợp bộ lọc.</div></div>`;
    return;
  }

  const theadHtml = `<thead><tr>
    <th>Ngày</th><th>Loại</th><th>Dự án</th><th>Nội dung</th><th>Diễn giải</th><th>Thành tiền</th><th>Hóa đơn</th><th>CK/Nhận tiền</th><th>Duyệt</th><th></th>
  </tr></thead>`;

  // Không còn nhóm theo dự án nữa — luôn hiển thị 1 bảng phẳng, sắp theo ngày mới nhất, có thêm cột Dự án riêng.
  const flatRows = rows.slice().sort((a,b)=> (b.date||'').localeCompare(a.date||''));

  // Tách riêng các khoản "Chờ duyệt" ra 1 khung riêng ở TRÊN CÙNG để dễ nhận biết và xử lý ngay.
  // Sau khi Duyệt/Từ chối, approvalStatus không còn là 'pending' nữa -> dòng đó tự động
  // "rơi" xuống khung "Thu Chi" bên dưới ở lần render kế tiếp (không cần code di chuyển thủ công).
  const pendingRows = flatRows.filter(t=> t.type==='OUT' && t.approvalStatus==='pending');
  const otherRows = flatRows.filter(t=> !(t.type==='OUT' && t.approvalStatus==='pending'));

  let html = '';
  if(pendingRows.length){
    html += txTableBlockHtml(`🟡 Khung chờ duyệt (${pendingRows.length})`, pendingRows, theadHtml, {pendingBlock:true, showSummary:false});
  }
  html += txTableBlockHtml(`Thu Chi (${otherRows.length} giao dịch)`, otherRows, theadHtml, {emptyText:'Chưa có giao dịch nào khác ngoài các khoản đang chờ duyệt ở trên.'});
  wrap.innerHTML = html;
}

let currentViewSource = 'tx'; // 'tx' | 'fc'

function openTxViewModal(id, source){
  currentViewSource = source || 'tx';
  const t = (currentViewSource==='fc' ? (typeof FIXEDCOSTS!=='undefined'?FIXEDCOSTS:[]) : TRANSACTIONS).find(x=>x.id===id);
  if(!t) return;
  const row = (label, value) => value ? `<dt>${label}</dt><dd>${value}</dd>` : '';
  const hasItems = Array.isArray(t.invoiceItems) && t.invoiceItems.length > 0;
  let html = `<dl class="tx-view-grid">
    ${row('Loại giao dịch', t.type==='IN' ? '<span class="tag tag-in">Thu</span>' : (hasItems ? '<span class="tag tag-gold">🧾 Hóa Đơn</span>' : '<span class="tag tag-out">Chi</span>'))}
    ${currentViewSource==='fc' ? '' : row('Dự án', escapeHtml(t.projectName||'—'))}
    ${row('Ngày', fmtDate(t.date))}
    ${row('Mã (code)', t.code ? escapeHtml(t.code) : '')}
    ${row('Nội dung', '<strong>'+escapeHtml(t.content||'')+'</strong>')}
    ${row('Diễn giải', escapeHtml(t.description||''))}
    ${!hasItems ? row('ĐVT', escapeHtml(t.unit||'')) : ''}
    ${!hasItems ? row('Số lượng', t.qty ? String(t.qty) : '') : ''}
    ${!hasItems ? row('Đơn giá', t.unitPrice ? fmtVND(t.unitPrice) : '') : ''}
    ${row('Thành tiền', '<strong style="color:'+(t.type==='IN'?'var(--teal)':'var(--red)')+'">'+fmtVND(t.amount)+'</strong>')}
  </dl>`;

  if(hasItems){
    html += `<div class="tx-view-section"><h5>📦 Chi tiết hàng hóa, dịch vụ</h5>
      <div class="table-wrap"><table class="data" style="font-size:12.5px;">
        <thead><tr><th>Tên hàng hóa, dịch vụ</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th><th>Thuế suất</th><th>Tiền thuế</th><th>Sau thuế</th></tr></thead>
        <tbody>${t.invoiceItems.map(it=>`
          <tr>
            <td>${escapeHtml(it.name||'—')}</td>
            <td>${escapeHtml(it.unit||'')}</td>
            <td class="num">${it.qty||0}</td>
            <td class="num">${fmtVND(it.unitPrice||0)}</td>
            <td class="num">${fmtVND(it.amount||0)}</td>
            <td class="num">${it.vatRate||0}%</td>
            <td class="num">${fmtVND(it.vatAmount||0)}</td>
            <td class="num"><strong>${fmtVND(it.amountAfterTax||0)}</strong></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
  }

  // Trạng thái hóa đơn — ai đăng nhập cũng bấm đổi được, TRỪ Sub-admin (GĐ chỉ xem)
  const invoiceIssued = (t.invoiceStatus||'pending')==='issued';
  const roDisabled = (typeof isSubAdmin==='function' && isSubAdmin()) ? 'disabled style="opacity:.5;cursor:not-allowed;"' : '';
  html += `<div class="tx-view-section"><h5>🧾 Thông tin hóa đơn</h5>
    <div class="seg tx-status-toggle" style="max-width:340px;">
      <button type="button" ${roDisabled} class="${invoiceIssued?'active-gold':''}" data-status-toggle="invoiceStatus" data-status-value="issued" data-tx-id="${t.id}">✅ Đã xuất hóa đơn</button>
      <button type="button" ${roDisabled} class="${!invoiceIssued?'active-gray':''}" data-status-toggle="invoiceStatus" data-status-value="pending" data-tx-id="${t.id}">⏳ Chưa xuất hóa đơn</button>
    </div>
    <dl class="tx-view-grid" style="margin-top:10px;">
      ${row('Số hóa đơn', escapeHtml(t.invoiceNumber||''))}
      ${row('Ngày hóa đơn', t.invoiceDate ? fmtDate(t.invoiceDate) : '')}
    </dl>${t.invoiceImage ? `<div class="tx-view-images"><img src="${t.invoiceImage}" data-lightbox="${t.invoiceImage}"></div>` : ''}</div>`;

  // Trạng thái CK/nhận tiền — nhãn động theo Thu/Chi, ai cũng đổi được, TRỪ Sub-admin (GĐ chỉ xem)
  const transferDone = (t.transferStatus||'pending')==='done';
  const doneLabel = t.type==='IN' ? '✅ Đã nhận tiền' : '✅ Đã chuyển khoản';
  const pendingLabel = t.type==='IN' ? '⏳ Chưa nhận tiền' : '⏳ Chưa chuyển khoản';
  const sectionTitle = t.type==='IN' ? '🏦 Thông tin nhận tiền' : '🏦 Thông tin chuyển khoản';
  html += `<div class="tx-view-section"><h5>${sectionTitle}</h5>
    <div class="seg tx-status-toggle" style="max-width:340px;">
      <button type="button" ${roDisabled} class="${transferDone?'active-gold':''}" data-status-toggle="transferStatus" data-status-value="done" data-tx-id="${t.id}">${doneLabel}</button>
      <button type="button" ${roDisabled} class="${!transferDone?'active-gray':''}" data-status-toggle="transferStatus" data-status-value="pending" data-tx-id="${t.id}">${pendingLabel}</button>
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
  if(status==='pending' && myEmail && isAuthorizedApprover(myEmail)){
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
  openTxModal(id, null, currentViewSource==='fc' ? 'fixedCosts' : 'transactions');
});

document.getElementById('tx-view-body').addEventListener('click', async (e)=>{
  const src = e.target.closest('[data-lightbox]')?.dataset.lightbox;
  if(src){ window.open(src, '_blank'); return; }

  const toggleBtn = e.target.closest('[data-status-toggle]');
  if(toggleBtn){
    const field = toggleBtn.dataset.statusToggle;
    const value = toggleBtn.dataset.statusValue;
    const id = toggleBtn.dataset.txId;
    const coll = currentViewSource==='fc' ? 'fixedCosts' : 'transactions';
    const arr = currentViewSource==='fc' ? (typeof FIXEDCOSTS!=='undefined'?FIXEDCOSTS:[]) : TRANSACTIONS;
    const t = arr.find(x=>x.id===id);
    try{
      await db.collection(coll).doc(id).update({ [field]: value });
      toast('Đã cập nhật trạng thái');
      if(t) logActivity(field==='invoiceStatus' ? 'status_invoice' : 'status_transfer',
        {projectName: t.projectName, content: t.content, amount: t.amount, type: t.type, note: value});
      openTxViewModal(id, currentViewSource);
    }catch(err){ toast('Lỗi: '+err.message); }
    return;
  }

  const approveBtn = e.target.closest('[data-approve-tx]');
  if(approveBtn){ await decideApproval(approveBtn.dataset.approveTx, 'approved', currentViewSource); openTxViewModal(approveBtn.dataset.approveTx, currentViewSource); return; }

  const rejectBtn = e.target.closest('[data-reject-tx]');
  if(rejectBtn){ await decideApproval(rejectBtn.dataset.rejectTx, 'rejected', currentViewSource); openTxViewModal(rejectBtn.dataset.rejectTx, currentViewSource); return; }

  const submitBtn = e.target.closest('[data-submit-approval]');
  if(submitBtn){
    const id = submitBtn.dataset.submitApproval;
    const role = submitBtn.dataset.role;
    await submitForApproval(id, role, currentViewSource);
    openTxViewModal(id, currentViewSource);
  }
});

document.getElementById('tx-table').addEventListener('click', (e)=>{
  const viewId = e.target.closest('[data-view-tx]')?.dataset.viewTx;
  const editId = e.target.closest('[data-edit-tx]')?.dataset.editTx;
  const delId = e.target.closest('[data-del-tx]')?.dataset.delTx;
  const approveId = e.target.closest('[data-approve-tx]')?.dataset.approveTx;
  const rejectId = e.target.closest('[data-reject-tx]')?.dataset.rejectTx;
  if(viewId) openTxViewModal(viewId, 'tx');
  if(editId) openTxModal(editId, null, 'transactions');
  if(delId){
    if(confirmDelete('Xóa giao dịch này?')){
      const t = TRANSACTIONS.find(x=>x.id===delId);
      db.collection('transactions').doc(delId).delete().then(()=>{
        toast('Đã xóa giao dịch');
        if(t) logActivity('delete', {projectName: t.projectName, content: t.content, amount: t.amount, type: t.type});
      });
    }
  }
  if(approveId) decideApproval(approveId, 'approved', 'tx');
  if(rejectId) decideApproval(rejectId, 'rejected', 'tx');
});

['tx-filter-project','tx-filter-type','tx-filter-code','tx-filter-month'].forEach(id=>{
  document.getElementById(id).addEventListener('change', renderTxTable);
});
document.getElementById('tx-search').addEventListener('input', renderTxTable);
