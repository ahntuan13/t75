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
    if(id){
      await db.collection('paymentOrders').doc(id).update(data);
      toast('Đã cập nhật');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = auth.currentUser.email;
      await db.collection('paymentOrders').add(data);
      toast(isAdvanceOrder(data) ? 'Đã tạo lệnh tạm ứng' : 'Đã tạo lệnh chi');
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

function printOrder(id){
  const o = ORDERS.find(x=>x.id===id);
  if(!o) return;
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>${isAdvanceOrder(o)?'Lệnh tạm ứng':'Lệnh chi'}</title>
    <style>
      body{font-family:'Times New Roman',serif;padding:40px;color:#111;}
      h2{text-align:center;text-transform:uppercase;margin-bottom:2px;}
      .center{text-align:center;}
      table{width:100%;border-collapse:collapse;margin-top:24px;}
      td{padding:8px 4px;vertical-align:top;}
      .lbl{width:200px;font-weight:bold;}
      .sig{display:flex;justify-content:space-between;margin-top:60px;text-align:center;}
      .sig div{width:30%;}
    </style></head><body>
    <div class="center">CÔNG TY .....................................<br>Số: ...... /${isAdvanceOrder(o)?'TU':'LC'}</div>
    <h2>${isAdvanceOrder(o)?'LỆNH TẠM ỨNG':'LỆNH CHI'}</h2>
    <div class="center">${escapeHtml(ORDER_TYPE_LABELS[o.orderType] || 'Thanh toán chi phí')} — Ngày ${fmtDate(o.date)}</div>
    <table>
      <tr><td class="lbl">Người/đơn vị chi:</td><td>${escapeHtml(o.payer||'—')}</td></tr>
      <tr><td class="lbl">Chi cho (đơn vị/cá nhân):</td><td>${escapeHtml(o.payee)}</td></tr>
      <tr><td class="lbl">STK nhận:</td><td>${escapeHtml(o.payeeBank||'—')}</td></tr>
      <tr><td class="lbl">MST:</td><td>${escapeHtml(o.payeeTaxCode||'—')}</td></tr>
      <tr><td class="lbl">Lý do chi:</td><td>${escapeHtml(o.reason)}</td></tr>
      <tr><td class="lbl">Dự án liên quan:</td><td>${escapeHtml(o.projectName||'—')}</td></tr>
      <tr><td class="lbl">Số tiền:</td><td><strong>${fmtVND(o.amount)}</strong></td></tr>
      ${isAdvanceOrder(o) ? `<tr><td class="lbl">Giải trình:</td><td>${escapeHtml(o.explanation||'—')}</td></tr>` : ''}
      <tr><td class="lbl">Ghi chú:</td><td>${escapeHtml(o.note||'—')}</td></tr>
    </table>
    <div class="sig">
      <div><strong>Người đề nghị</strong><br><br><br>${escapeHtml(o.requester||'')}</div>
      <div><strong>Kế toán trưởng</strong><br><br><br></div>
      <div><strong>Giám đốc duyệt chi</strong><br><br><br>${escapeHtml(o.approvedBy||'')}</div>
    </div>
    </body></html>`);
  w.document.close();
  w.print();
}

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
          ${isAdmin() ? `<button class="icon-btn" data-del-order="${o.id}" title="Xóa">🗑</button>` : ''}
        </div>
      </td>
    </tr>`;
}
const ORDER_THEAD = `<thead><tr>
    <th>Ngày</th><th>Loại</th><th>Người nhận</th><th>Lý do</th><th>Dự án</th><th>Số tiền</th><th>Duyệt</th><th></th>
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
  if(editId){
    const o = ORDERS.find(x=>x.id===editId);
    openOrderModal(editId, o && isAdvanceOrder(o) ? 'advance' : 'payment');
  }
  if(printId) printOrder(printId);
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
      });
    }
  }
}
