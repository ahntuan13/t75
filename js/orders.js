// =============================================================
// LỆNH CHI (payment) & LỆNH TẠM ỨNG (advance) — dùng chung 1 collection
// "paymentOrders" + 1 form (modal-order), chỉ khác nhau ở bộ lọc hiển thị
// và danh sách "Loại lệnh chi" cho phép chọn khi tạo mới.
//
// Cơ chế duyệt ĐỒNG BỘ y hệt bên tạo giao dịch Chi (Thu Chi):
// Gửi Giám đốc duyệt -> GĐ đăng nhập đúng email -> bấm Duyệt/Từ chối.
// Khi Duyệt, tự động ghi/khớp 1 khoản Chi tương ứng trong Thu chi
// (có Dự án) hoặc Chi phí gián tiếp (không có Dự án).
// =============================================================

let ORDERS = [];

function listenOrders(){
  db.collection('paymentOrders').orderBy('date','desc').onSnapshot((snap)=>{
    ORDERS = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    renderOrdersTable();
    renderAdvanceTable();
    if(window.renderApprovalBanner) renderApprovalBanner();
    if(window.renderNotifications) renderNotifications();
  }, (err)=> console.error('orders listen error', err));
}

const ORDER_TYPE_LABELS = {
  payment: 'Thanh toán chi phí',
  advance_purchase: 'Tạm ứng thanh toán',
  advance_salary: 'Tạm ứng lương',
};
const ADVANCE_TYPES = ['advance_purchase', 'advance_salary'];
function isAdvanceOrder(o){ return ADVANCE_TYPES.includes(o.orderType); }

// context: 'payment' (mở từ trang Lệnh chi) | 'advance' (mở từ trang Lệnh tạm ứng)
function openOrderModal(id, context, presetType){
  const o = id ? ORDERS.find(x=>x.id===id) : {};
  const effectiveContext = context || (id ? (isAdvanceOrder(o) ? 'advance' : 'payment') : 'payment');

  // Giới hạn lựa chọn "Loại lệnh chi" theo đúng trang đang mở — Lệnh chi không hiện 2 mục tạm ứng nữa.
  const typeSelect = document.getElementById('order-type');
  if(effectiveContext === 'advance'){
    typeSelect.innerHTML = `
      <option value="advance_purchase">Tạm ứng thanh toán</option>
      <option value="advance_salary">Tạm ứng lương</option>`;
  } else {
    typeSelect.innerHTML = `<option value="payment">Thanh toán chi phí</option>`;
  }

  document.getElementById('order-modal-title').textContent = id
    ? 'Sửa lệnh chi'
    : (effectiveContext === 'advance' ? 'Tạo lệnh tạm ứng' : 'Tạo lệnh chi');
  document.getElementById('order-id').value = id || '';
  document.getElementById('order-date').value = o.date || todayISO();
  document.getElementById('order-project').value = o.projectId || '';
  document.getElementById('order-code').value = o.code || '';
  typeSelect.value = o.orderType || presetType || (effectiveContext === 'advance' ? 'advance_purchase' : 'payment');
  document.getElementById('order-payer').value = o.payer || (id ? '' : 'Công ty TNHH DVKT Cách Nhiệt Tuấn 75');
  document.getElementById('order-payee').value = o.payee || '';
  document.getElementById('order-payee-bank').value = o.payeeBank || '';
  document.getElementById('order-payee-tax').value = o.payeeTaxCode || '';
  document.getElementById('order-reason').value = o.reason || '';
  setMoneyInputValue(document.getElementById('order-amount'), o.amount);
  document.getElementById('order-requester').value = o.requester || (auth.currentUser ? auth.currentUser.email : '');
  document.getElementById('order-explanation').value = o.explanation || '';
  document.getElementById('order-note').value = o.note || '';
  document.getElementById('order-approval-target').value = o.approvalStatus==='pending' ? (o.approverRole||'') : '';
  renderOrderApprovalCurrentStatus(o);
  fillOrderPayeeDatalist();
  applyAdvanceSalaryDefaults(!id); // chỉ tự gợi ý khi TẠO MỚI, không ghi đè khi đang sửa
  openModal('modal-order');
}

// Danh sách nhân viên (lấy từ mục Bảng lương) để gợi ý chọn nhanh ở ô "Người/đơn vị nhận chi"
function fillOrderPayeeDatalist(){
  const dl = document.getElementById('order-payee-employees');
  if(!dl) return;
  dl.innerHTML = (typeof EMPLOYEES!=='undefined' ? EMPLOYEES : []).map(e=>`<option value="${escapeHtml(e.name)}">`).join('');
}

// Khi chọn "Tạm ứng lương": gợi ý sẵn Lý do chi theo tháng hiện tại (chỉ khi đang trống, không ghi đè)
function applyAdvanceSalaryDefaults(isNew){
  const type = document.getElementById('order-type').value;
  const reasonEl = document.getElementById('order-reason');
  if(type === 'advance_salary' && isNew && !reasonEl.value.trim()){
    const d = new Date(document.getElementById('order-date').value || todayISO());
    reasonEl.value = `Tạm ứng lương tháng ${d.getMonth()+1}/${d.getFullYear()}`;
  }
}
document.getElementById('order-type')?.addEventListener('change', ()=> applyAdvanceSalaryDefaults(!document.getElementById('order-id').value));

document.getElementById('btn-add-order')?.addEventListener('click', ()=> openOrderModal(null, 'payment'));
document.getElementById('btn-add-advance')?.addEventListener('click', ()=> openOrderModal(null, 'advance'));

function renderOrderApprovalCurrentStatus(o){
  const el = document.getElementById('order-approval-current-status');
  if(!el) return;
  const roleLabel = 'Giám đốc';
  if(!o.approvalStatus || o.approvalStatus==='none'){ el.textContent = 'Chưa gửi duyệt.'; return; }
  if(o.approvalStatus==='pending') el.innerHTML = `🟡 Đang chờ ${roleLabel} (${escapeHtml(o.approverEmail||'')}) duyệt.`;
  else if(o.approvalStatus==='approved') el.innerHTML = `✅ Đã được ${roleLabel} duyệt (${escapeHtml(o.approvedBy||'')}).`;
  else if(o.approvalStatus==='rejected') el.innerHTML = `❌ Đã bị ${roleLabel} từ chối (${escapeHtml(o.approvedBy||'')}).`;
}

document.getElementById('save-order-btn').addEventListener('click', async ()=>{
  const id = document.getElementById('order-id').value;
  const payee = document.getElementById('order-payee').value.trim();
  const reason = document.getElementById('order-reason').value.trim();
  const amount = parseMoneyInput(document.getElementById('order-amount'));
  const date = document.getElementById('order-date').value;
  if(!payee || !reason || !amount || !date){ toast('Vui lòng nhập đủ thông tin bắt buộc (*)'); return; }

  const projectId = document.getElementById('order-project').value;
  const proj = projectId ? projectById(projectId) : null;
  const data = {
    date, projectId: projectId || null, projectName: proj ? proj.name : '',
    code: document.getElementById('order-code').value,
    orderType: document.getElementById('order-type').value,
    payer: document.getElementById('order-payer').value.trim(),
    payee, reason, amount,
    payeeBank: document.getElementById('order-payee-bank').value.trim(),
    payeeTaxCode: document.getElementById('order-payee-tax').value.trim(),
    requester: document.getElementById('order-requester').value.trim(),
    explanation: document.getElementById('order-explanation').value.trim(),
    note: document.getElementById('order-note').value.trim(),
  };

  const approvalTarget = document.getElementById('order-approval-target').value; // '' hoặc 'GD'
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

  try{
    const label = isAdvanceOrder(data) ? (ORDER_TYPE_LABELS[data.orderType]||'Lệnh tạm ứng') : 'Lệnh chi';
    if(id){
      await db.collection('paymentOrders').doc(id).update(data);
      toast('Đã cập nhật');
      logActivity('update', {projectName: label, content: data.reason, amount: data.amount, type: 'OUT'});
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = auth.currentUser.email;
      await db.collection('paymentOrders').add(data);
      toast(isAdvanceOrder(data) ? 'Đã tạo lệnh tạm ứng' : 'Đã tạo lệnh chi');
      logActivity('create', {projectName: label, content: data.reason, amount: data.amount, type: 'OUT'});
    }
    closeModal('modal-order');
  }catch(err){ toast('Lỗi: '+err.message); }
});

// ---------------- Duyệt (Giám đốc) — dùng chung cho cả 2 loại ----------------
async function decideOrderApproval(id, decision){
  const o = ORDERS.find(x=>x.id===id);
  if(!o) return;
  const label = decision==='approved' ? 'DUYỆT' : 'TỪ CHỐI';
  if(!confirm(`Xác nhận ${label} "${o.reason}" — ${fmtVND(o.amount)}?`)) return;
  try{
    await db.collection('paymentOrders').doc(id).update({
      approvalStatus: decision,
      approvedBy: auth.currentUser.email,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    toast(decision==='approved' ? 'Đã duyệt' : 'Đã từ chối');
    logActivity('approval_decide', {projectName: isAdvanceOrder(o)?'Lệnh tạm ứng':'Lệnh chi', content: o.reason, amount: o.amount, type:'OUT', note: decision==='approved'?'Đã duyệt':'Đã từ chối'});

    if(decision === 'approved'){
      const hasProject = !!o.projectId;
      const isAdvance = isAdvanceOrder(o);
      const targetCollection = hasProject ? 'transactions' : 'fixedCosts';
      const txData = {
        type:'OUT',
        projectId: hasProject ? o.projectId : '', projectName: hasProject ? (o.projectName || '') : '',
        date: o.date, code: hasProject ? (o.code || '') : (o.code || (isAdvance ? 'INDIRECT' : '')),
        content: o.reason,
        description: `Chi cho ${o.payee}` + (o.payer ? ` (từ ${o.payer})` : '') + (o.note ? ' — '+o.note : ''),
        unit:'', qty:0, unitPrice:0, amount: o.amount,
        invoiceNumber:'', invoiceDate:'',
        bankName:'', bankAccount: o.payeeBank||'', bankHolder: o.payee||'', transferDate:'',
        note:`Tự động tạo từ ${isAdvance ? 'Lệnh tạm ứng' : 'Lệnh chi'} (${o.payee})${o.payeeTaxCode ? ' — MST: '+o.payeeTaxCode : ''}`,
      };
      // Tạm ứng không gắn dự án -> vào Chi phí gián tiếp và gắn tag "Chờ giải trình"
      // (vẫn tính vào tổng Chi phí gián tiếp cho tới khi KT giải trình xong, chuyển hẳn qua Thu Chi).
      if(isAdvance && !hasProject){
        txData.advanceExplainStatus = 'pending';
      }
      if(o.transactionId){
        await db.collection(targetCollection).doc(o.transactionId).update(txData);
      } else {
        txData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        txData.createdBy = auth.currentUser.email;
        const txRef = await db.collection(targetCollection).add(txData);
        await db.collection('paymentOrders').doc(id).update({transactionId: txRef.id, transactionCollection: targetCollection});
      }
    }
  }catch(err){ toast('Lỗi: '+err.message); }
}

function statusTag(o){
  const status = o.approvalStatus || 'none';
  if(status==='approved') return '<span class="tag tag-in">✅ Đã duyệt</span>';
  if(status==='rejected') return '<span class="tag tag-out">❌ Từ chối</span>';
  if(status==='pending') return '<span class="tag tag-gold">🟡 Chờ duyệt</span>';
  return '<span class="tag tag-gray">Chưa gửi duyệt</span>';
}

// ---------------- IN PHIẾU "ĐỀ XUẤT CHI PHÍ" (theo đúng mẫu công ty) ----------------
// Dùng chung cho in 1 lệnh (nút 🖨 từng dòng) hoặc in gộp nhiều lệnh cùng lúc (đã chọn checkbox).
// Nếu 1 lệnh đã có "Giải trình" (nhiều dự án), mỗi khoản phân bổ sẽ tách thành 1 dòng riêng trong phiếu.
const COMPANY_HEADER = {
  name: 'TUAN75 INSULATION TECHNICAL SERVICES CO.,LTD',
  address: 'Add: No. 75, Road D4, Lavender Residential Area, Hamlet 4, Thanh Phu Commune, Vinh Cuu District, Dong Nai Province, Viet Nam',
  bank: 'Bank number: 0914 288 146 – Eximbank – Dong Nai',
  tel: 'Tel: 0914 288 146   |   Tax: 3604002848',
  email: 'Email: hoangtuan@tuan75insulation.com',
};

function buildProposalRows(orders){
  const rows = [];
  orders.forEach(o=>{
    if(Array.isArray(o.explainAllocations) && o.explainAllocations.length){
      o.explainAllocations.forEach(a=>{
        rows.push({
          project: a.projectName || '—', date: o.date, code: a.code || '',
          content: a.content || o.reason, description: a.description || '',
          unit: a.unit || '', qty: a.qty || 1, unitPrice: a.unitPrice || a.amount, amount: a.amount,
          note: '',
        });
      });
    } else {
      rows.push({
        project: o.projectName || 'CASHFLOW_INDIRECT', date: o.date, code: o.code || '',
        content: o.reason, description: o.explanation || o.note || '',
        unit: '', qty: 1, unitPrice: o.amount, amount: o.amount,
        note: '',
      });
    }
  });
  return rows;
}

function printOrdersCombined(ids){
  const orders = ids.map(id=> ORDERS.find(x=>x.id===id)).filter(Boolean);
  if(orders.length === 0){ toast('Chưa chọn lệnh nào để in'); return; }
  const rows = buildProposalRows(orders);
  const total = rows.reduce((s,r)=>s+Number(r.amount||0),0);
  const now = new Date();
  const docNo = `PC-${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
  const requester = orders[0].requester || '';
  const approvedBy = orders.find(o=>o.approvedBy)?.approvedBy || '';

  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Đề xuất chi phí ${docNo}</title>
    <style>
      @page{size:A4 landscape;margin:14mm;}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12.5px;}
      .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #7a1f1f;padding-bottom:10px;}
      .co-name{color:#7a1f1f;font-weight:800;font-size:15px;letter-spacing:.3px;}
      .co-info{font-size:11px;color:#333;line-height:1.5;margin-top:3px;}
      .header .date{font-size:12.5px;white-space:nowrap;padding-top:4px;}
      h1{text-align:center;font-size:20px;letter-spacing:1px;margin:18px 0 6px;}
      .docno{margin:6px 0 4px;}
      .docno b{background:#fff6cc;padding:2px 8px;border:1px solid #e0d090;}
      .section-title{font-weight:700;margin:10px 0 6px;}
      table{width:100%;border-collapse:collapse;margin-top:6px;}
      th,td{border:1px solid #999;padding:6px 7px;font-size:11.5px;}
      th{background:#fff6cc;text-align:center;font-weight:700;}
      td.num{text-align:right;font-variant-numeric:tabular-nums;}
      td.center{text-align:center;}
      tr.total td{font-weight:800;}
      tr.total td.amt{color:#c0392b;}
      .sig{display:flex;justify-content:space-between;margin-top:46px;text-align:center;}
      .sig div{width:31%;}
      .sig .role{font-weight:700;}
      .sig .hint{font-size:10.5px;color:#666;}
      .sig .space{height:70px;}
    </style></head><body>
    <div class="header">
      <div>
        <div class="co-name">${COMPANY_HEADER.name}</div>
        <div class="co-info">
          ${COMPANY_HEADER.address}<br>
          ${COMPANY_HEADER.bank}<br>
          ${COMPANY_HEADER.tel}<br>
          ${COMPANY_HEADER.email}
        </div>
      </div>
      <div class="date">Đồng Nai, Ngày ${now.getDate()}, tháng ${now.getMonth()+1}, năm ${now.getFullYear()}</div>
    </div>
    <h1>ĐỀ XUẤT CHI PHÍ</h1>
    <div class="docno">Số/: <b>${docNo}</b></div>
    <div class="section-title">NỘI DUNG ĐỀ XUẤT CHI VÀ SỐ TIỀN CHI:</div>
    <table>
      <thead><tr>
        <th>DỰ ÁN</th><th>THỜI GIAN</th><th>CODE</th><th>NỘI DUNG</th><th>DIỄN GIẢI</th>
        <th>ĐVT</th><th>SL</th><th>ĐƠN GIÁ<br>(SAU VAT)</th><th>THÀNH TIỀN</th><th>GHI CHÚ</th>
      </tr></thead>
      <tbody>
        ${rows.map(r=>`<tr>
          <td>${escapeHtml(r.project)}</td>
          <td class="center">${fmtDate(r.date)}</td>
          <td class="center">${escapeHtml(r.code)}</td>
          <td>${escapeHtml(r.content)}</td>
          <td>${escapeHtml(r.description)}</td>
          <td class="center">${escapeHtml(r.unit)}</td>
          <td class="center">${r.qty}</td>
          <td class="num">${fmtNum(r.unitPrice)}</td>
          <td class="num">${fmtNum(r.amount)}</td>
          <td>${escapeHtml(r.note)}</td>
        </tr>`).join('')}
        <tr class="total"><td colspan="8" style="text-align:right;">TỔNG CỘNG:</td><td class="num amt">${fmtNum(total)}</td><td></td></tr>
      </tbody>
    </table>
    <div class="sig">
      <div><div class="role">Người lập phiếu</div><div class="hint">(Ký, họ tên)</div><div class="space"></div>${escapeHtml(requester)}</div>
      <div><div class="role">Kế toán</div><div class="hint">(Ký, họ tên)</div><div class="space"></div></div>
      <div><div class="role">Giám đốc</div><div class="hint">(Ký, họ tên, đóng dấu)</div><div class="space"></div>${escapeHtml(approvedBy)}</div>
    </div>
    </body></html>`);
  w.document.close();
  setTimeout(()=> w.print(), 300);
}

// In 1 lệnh (nút 🖨 từng dòng)
function printOrder(id){ printOrdersCombined([id]); }

// In các lệnh đã được tick chọn trong 1 bảng (Lệnh chi hoặc Lệnh tạm ứng)
function printSelectedOrders(tableId){
  const table = document.getElementById(tableId);
  if(!table) return;
  const ids = [...table.querySelectorAll('.order-select-cb:checked')].map(cb=>cb.dataset.orderId);
  if(ids.length === 0){ toast('Vui lòng tick chọn ít nhất 1 lệnh để in'); return; }
  printOrdersCombined(ids);
}
document.getElementById('btn-print-orders-selected')?.addEventListener('click', ()=> printSelectedOrders('orders-table'));
document.getElementById('btn-print-advance-selected')?.addEventListener('click', ()=> printSelectedOrders('advance-table'));

// ---------------- LỆNH CHI (chỉ orderType='payment') ----------------
function getFilteredOrders(){
  const status = document.getElementById('ord-filter-status').value;
  const project = document.getElementById('ord-filter-project').value;
  return ORDERS.filter(o=>{
    if(isAdvanceOrder(o)) return false;
    if(status && (o.approvalStatus||'none')!==status) return false;
    if(project && o.projectId!==project) return false;
    return true;
  });
}

function orderRowHtml(o){
  const myEmail = (auth.currentUser && auth.currentUser.email || '').toLowerCase();
  let approveActions = '';
  if((o.approvalStatus||'none')==='pending' && myEmail && o.approverEmail && myEmail===o.approverEmail.toLowerCase()){
    approveActions = `<button class="icon-btn" data-approve-order="${o.id}" title="Duyệt">✅</button><button class="icon-btn" data-reject-order="${o.id}" title="Từ chối">❌</button>`;
  }
  const explainTag = isAdvanceOrder(o)
    ? (o.explanation && o.explanation.trim()
        ? ' <span class="tag tag-gold" title="Đã có nội dung giải trình">📝 Đã giải trình</span>'
        : ' <span class="tag tag-gray">⏳ Chưa giải trình</span>')
    : '';
  return `<tr>
      <td><input type="checkbox" class="order-select-cb" data-order-id="${o.id}"></td>
      <td>${fmtDate(o.date)}</td>
      <td>${escapeHtml(ORDER_TYPE_LABELS[o.orderType] || 'Thanh toán chi phí')}</td>
      <td><strong>${escapeHtml(o.payee)}</strong></td>
      <td>${escapeHtml(o.reason)}${explainTag}</td>
      <td>${escapeHtml(o.projectName||'—')}</td>
      <td class="num"><strong>${fmtVND(o.amount)}</strong></td>
      <td>${statusTag(o)} ${approveActions}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-print-order="${o.id}" title="In">🖨</button>
          <button class="icon-btn" data-edit-order="${o.id}" title="Sửa">✎</button>
          ${isAdvanceOrder(o) ? `<button class="icon-btn" data-explain-order="${o.id}" title="Giải trình">🧾</button>` : ''}
          <button class="icon-btn" data-del-order="${o.id}" title="Xóa">🗑</button>
        </div>
      </td>
    </tr>`;
}
const ORDER_THEAD = `<thead><tr>
    <th></th><th>Ngày</th><th>Loại</th><th>Người nhận</th><th>Lý do</th><th>Dự án</th><th>Số tiền</th><th>Duyệt</th><th></th>
  </tr></thead>`;

function renderOrdersTable(){
  const table = document.getElementById('orders-table');
  if(!table) return;
  const rows = getFilteredOrders();
  if(rows.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">📝</div>Chưa có lệnh chi nào.</div></td></tr>`;
    return;
  }
  table.innerHTML = ORDER_THEAD + `<tbody>${rows.map(orderRowHtml).join('')}</tbody>`;
}

document.getElementById('orders-table')?.addEventListener('click', handleOrderTableClick);
['ord-filter-status','ord-filter-project'].forEach(id=>{
  document.getElementById(id)?.addEventListener('change', renderOrdersTable);
});

// ---------------- LỆNH TẠM ỨNG (orderType = advance_purchase | advance_salary) ----------------
function getFilteredAdvances(){
  const status = document.getElementById('adv-filter-status').value;
  const project = document.getElementById('adv-filter-project').value;
  return ORDERS.filter(o=>{
    if(!isAdvanceOrder(o)) return false;
    if(status && (o.approvalStatus||'none')!==status) return false;
    if(project && o.projectId!==project) return false;
    return true;
  });
}

function renderAdvanceTable(){
  const table = document.getElementById('advance-table');
  if(!table) return;
  const rows = getFilteredAdvances();
  if(rows.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">💳</div>Chưa có lệnh tạm ứng nào.</div></td></tr>`;
    return;
  }
  table.innerHTML = ORDER_THEAD + `<tbody>${rows.map(orderRowHtml).join('')}</tbody>`;
}

document.getElementById('advance-table')?.addEventListener('click', handleOrderTableClick);
['adv-filter-status','adv-filter-project'].forEach(id=>{
  document.getElementById(id)?.addEventListener('change', renderAdvanceTable);
});

// Click handler dùng chung cho cả 2 bảng
function handleOrderTableClick(e){
  const editId = e.target.closest('[data-edit-order]')?.dataset.editOrder;
  const delId = e.target.closest('[data-del-order]')?.dataset.delOrder;
  const printId = e.target.closest('[data-print-order]')?.dataset.printOrder;
  const approveId = e.target.closest('[data-approve-order]')?.dataset.approveOrder;
  const rejectId = e.target.closest('[data-reject-order]')?.dataset.rejectOrder;
  const explainId = e.target.closest('[data-explain-order]')?.dataset.explainOrder;
  if(editId){
    const o = ORDERS.find(x=>x.id===editId);
    openOrderModal(editId, o && isAdvanceOrder(o) ? 'advance' : 'payment');
  }
  if(printId) printOrder(printId);
  if(explainId) openOrderExplainModal(explainId);
  if(approveId) decideOrderApproval(approveId, 'approved');
  if(rejectId) decideOrderApproval(rejectId, 'rejected');
  if(delId){
    if(confirmDelete('Xóa dòng này? Nếu đã được duyệt và tự động ghi vào Thu chi/Chi phí gián tiếp, khoản tương ứng cũng sẽ bị xóa theo.')){
      const ord = ORDERS.find(x=>x.id===delId);
      db.collection('paymentOrders').doc(delId).delete().then(async ()=>{
        if(ord && ord.transactionId){
          try{ await db.collection(ord.transactionCollection || 'transactions').doc(ord.transactionId).delete(); }catch(err){}
        }
        toast('Đã xóa');
        if(ord) logActivity('delete', {projectName: isAdvanceOrder(ord)?'Lệnh tạm ứng':'Lệnh chi', content: ord.reason, amount: ord.amount, type:'OUT'});
      });
    }
  }
}

// =============================================================
// GIẢI TRÌNH LỆNH TẠM ỨNG — chia 1 lệnh tạm ứng cho tối đa 5 dự án khác nhau.
// Mỗi khung "Giải trình N" có Dự án riêng -> khi lưu, tự tạo 1 khoản Chi (Thu Chi)
// cho đúng dự án đó, cộng dồn đúng vào chi phí dự án tương ứng.
// =============================================================

function fillExplainProjectSelects(){
  for(let i=1;i<=5;i++){
    const sel = document.getElementById(`exp${i}-project`);
    if(!sel) continue;
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Không chọn —</option>' + PROJECTS.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    if(cur) sel.value = cur;
  }
}

function updateExplainAmountCheck(){
  const order = ORDERS.find(x=>x.id===document.getElementById('exp-order-id').value);
  let total = 0;
  for(let i=1;i<=5;i++){
    total += parseMoneyInput(document.getElementById(`exp${i}-amount`));
  }
  const el = document.getElementById('exp-total-check');
  if(!el) return;
  const orderAmount = order ? Number(order.amount||0) : 0;
  const diff = orderAmount - total;
  el.innerHTML = `Đã phân bổ: <strong>${fmtVND(total)}</strong> / Lệnh gốc: <strong>${fmtVND(orderAmount)}</strong>` +
    (diff === 0 ? ' <span style="color:var(--teal)">✅ Khớp đủ</span>'
      : diff > 0 ? ` <span style="color:var(--gold)">⚠️ Còn thiếu ${fmtVND(diff)}</span>`
      : ` <span style="color:var(--red)">⚠️ Vượt ${fmtVND(-diff)} so với lệnh gốc</span>`);
}

// Gắn auto-calc SL*Đơn giá -> Thành tiền cho từng khung, và cập nhật lại tổng mỗi khi gõ
for(let i=1;i<=5;i++){
  const qtyEl = document.getElementById(`exp${i}-qty`);
  const priceEl = document.getElementById(`exp${i}-price`);
  const amountEl = document.getElementById(`exp${i}-amount`);
  if(!qtyEl || !priceEl || !amountEl) continue;
  const recalc = ()=>{
    const qty = Number(qtyEl.value) || 1;
    const price = parseMoneyInput(priceEl);
    if(price) setMoneyInputValue(amountEl, qty*price);
    updateExplainAmountCheck();
  };
  qtyEl.addEventListener('input', recalc);
  priceEl.addEventListener('input', ()=>{ formatMoneyInput(priceEl); recalc(); });
  amountEl.addEventListener('input', ()=>{ formatMoneyInput(amountEl); updateExplainAmountCheck(); });
}

function openOrderExplainModal(orderId){
  const o = ORDERS.find(x=>x.id===orderId);
  if(!o) return;
  fillExplainProjectSelects();
  document.getElementById('exp-order-id').value = orderId;
  document.getElementById('exp-date').value = todayISO();
  document.getElementById('exp-payee').value = o.payee || '';
  document.getElementById('exp-summary').innerHTML =
    `<strong>${escapeHtml(ORDER_TYPE_LABELS[o.orderType]||'Tạm ứng')}</strong> — ${escapeHtml(o.reason)}<br>Số tiền lệnh gốc: <strong>${fmtVND(o.amount)}</strong>`;

  const existing = Array.isArray(o.explainAllocations) ? o.explainAllocations : [];
  for(let i=1;i<=5;i++){
    const a = existing[i-1] || {};
    document.getElementById(`exp${i}-project`).value = a.projectId || '';
    document.getElementById(`exp${i}-code`).value = a.code || '';
    document.getElementById(`exp${i}-content`).value = a.content || '';
    document.getElementById(`exp${i}-desc`).value = a.description || '';
    document.getElementById(`exp${i}-unit`).value = a.unit || '';
    document.getElementById(`exp${i}-qty`).value = a.qty || 1;
    setMoneyInputValue(document.getElementById(`exp${i}-price`), a.unitPrice);
    setMoneyInputValue(document.getElementById(`exp${i}-amount`), a.amount);
  }
  document.getElementById('exp-approval-target').value = '';
  updateExplainAmountCheck();
  openModal('modal-order-explain');
}

document.getElementById('save-explain-btn')?.addEventListener('click', async ()=>{
  const orderId = document.getElementById('exp-order-id').value;
  const o = ORDERS.find(x=>x.id===orderId);
  if(!o) return;
  const date = document.getElementById('exp-date').value || todayISO();

  const blocks = [];
  for(let i=1;i<=5;i++){
    const projectId = document.getElementById(`exp${i}-project`).value;
    const amount = parseMoneyInput(document.getElementById(`exp${i}-amount`));
    if(!projectId || !amount) continue; // khung để trống -> bỏ qua
    const proj = projectById(projectId);
    blocks.push({
      projectId, projectName: proj ? proj.name : '',
      code: document.getElementById(`exp${i}-code`).value,
      content: document.getElementById(`exp${i}-content`).value.trim() || o.reason,
      description: document.getElementById(`exp${i}-desc`).value.trim(),
      unit: document.getElementById(`exp${i}-unit`).value.trim(),
      qty: Number(document.getElementById(`exp${i}-qty`).value) || 1,
      unitPrice: parseMoneyInput(document.getElementById(`exp${i}-price`)),
      amount,
    });
  }
  if(blocks.length === 0){ toast('Vui lòng điền ít nhất 1 khung Giải trình (chọn Dự án + Số tiền)'); return; }

  const approvalTarget = document.getElementById('exp-approval-target').value;
  let approverEmail = '';
  if(approvalTarget){
    approverEmail = APPROVERS.gdEmail || '';
    if(!approverEmail){ toast('Chưa cài đặt email Giám đốc — vào mục Người dùng để nhập trước.'); return; }
  }

  try{
    const CHUNK = 400;
    const batch = db.batch();
    blocks.forEach(b=>{
      const ref = db.collection('transactions').doc();
      const txData = {
        type:'OUT', projectId: b.projectId, projectName: b.projectName,
        date, code: b.code, content: b.content, description: b.description,
        unit: b.unit, qty: b.qty, unitPrice: b.unitPrice, amount: b.amount,
        invoiceNumber:'', invoiceDate:'', bankName:'', bankAccount:'', bankHolder:'', transferDate:'',
        note: `Giải trình từ Lệnh tạm ứng (${o.payee}) — ${o.reason}`,
        invoiceImage:'', transferImage:'', invoiceStatus:'pending', transferStatus:'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: auth.currentUser.email,
      };
      if(approvalTarget){
        txData.approvalStatus = 'pending';
        txData.approverRole = approvalTarget;
        txData.approverEmail = approverEmail;
        txData.approvalSubmittedAt = firebase.firestore.FieldValue.serverTimestamp();
        txData.approvedBy = '';
        txData.approvedAt = '';
      }
      batch.set(ref, txData);
    });
    await batch.commit();

    const orderUpdate = {
      explainAllocations: blocks,
      explainedAt: firebase.firestore.FieldValue.serverTimestamp(),
      explainedBy: auth.currentUser.email,
    };
    await db.collection('paymentOrders').doc(orderId).update(orderUpdate);

    // Nếu lệnh này trước đó đã tự động vào Chi phí gián tiếp (do chưa gắn dự án) -> đánh dấu đã giải trình,
    // loại khỏi tổng Chi phí gián tiếp (số liệu chính thức giờ nằm trong Thu Chi, tránh tính trùng).
    if(o.transactionCollection === 'fixedCosts' && o.transactionId){
      try{
        await db.collection('fixedCosts').doc(o.transactionId).update({
          advanceExplainStatus: 'explained',
          movedToTransactionId: orderId,
          explainedAt: firebase.firestore.FieldValue.serverTimestamp(),
          explainedBy: auth.currentUser.email,
        });
      }catch(err){ console.error('mark fixedCosts explained error', err); }
    }

    toast(`✅ Đã giải trình xong — tạo ${blocks.length} khoản Chi phân bổ theo dự án`);
    logActivity('update', {projectName:'Giải trình tạm ứng', content: o.reason, amount: blocks.reduce((s,b)=>s+b.amount,0), type:'OUT'});
    closeModal('modal-order-explain');
  }catch(err){ toast('Lỗi: '+err.message); }
});
