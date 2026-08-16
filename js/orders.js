// =============================================================
// PAYMENT ORDERS (LỆNH CHI) MODULE
// Cơ chế duyệt ĐỒNG BỘ y hệt bên tạo giao dịch Chi (Thu Chi):
// Gửi Giám đốc duyệt -> GĐ đăng nhập đúng email -> bấm Duyệt/Từ chối.
// Khi Duyệt, tự động ghi/khớp 1 khoản Chi tương ứng trong Thu chi.
// =============================================================

let ORDERS = [];

function listenOrders(){
  db.collection('paymentOrders').orderBy('date','desc').onSnapshot((snap)=>{
    ORDERS = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    renderOrdersTable();
    if(window.renderApprovalBanner) renderApprovalBanner();
    if(window.renderNotifications) renderNotifications();
  }, (err)=> console.error('orders listen error', err));
}

const ORDER_TYPE_LABELS = {
  payment: 'Thanh toán chi phí',
  advance_purchase: 'Tạm ứng thanh toán',
  advance_salary: 'Tạm ứng lương',
};

function openOrderModal(id, presetType){
  document.getElementById('order-modal-title').textContent = id ? 'Sửa lệnh chi' : (presetType ? (ORDER_TYPE_LABELS[presetType] || 'Tạo lệnh chi') : 'Tạo lệnh chi');
  document.getElementById('order-id').value = id || '';
  const o = id ? ORDERS.find(x=>x.id===id) : {};
  document.getElementById('order-date').value = o.date || todayISO();
  document.getElementById('order-project').value = o.projectId || '';
  document.getElementById('order-code').value = o.code || '';
  document.getElementById('order-type').value = o.orderType || presetType || 'payment';
  document.getElementById('order-payer').value = o.payer || (id ? '' : 'Công ty TNHH DVKT Cách Nhiệt Tuấn 75');
  document.getElementById('order-payee').value = o.payee || '';
  document.getElementById('order-payee-bank').value = o.payeeBank || '';
  document.getElementById('order-payee-tax').value = o.payeeTaxCode || '';
  document.getElementById('order-reason').value = o.reason || '';
  setMoneyInputValue(document.getElementById('order-amount'), o.amount);
  document.getElementById('order-requester').value = o.requester || (auth.currentUser ? auth.currentUser.email : '');
  document.getElementById('order-note').value = o.note || '';
  // Khối gửi duyệt: chỉ để trống chọn khi CHƯA đang chờ duyệt — tránh vô tình gửi lại khi chỉ sửa field khác
  document.getElementById('order-approval-target').value = o.approvalStatus==='pending' ? (o.approverRole||'') : '';
  renderOrderApprovalCurrentStatus(o);
  openModal('modal-order');
}

document.getElementById('btn-add-order')?.addEventListener('click', ()=> openOrderModal(null));

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
    note: document.getElementById('order-note').value.trim(),
  };

  // Gửi duyệt Giám đốc — chỉ khi người dùng chủ động chọn ở dropdown (giống hệt Thu Chi)
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
      toast('Đã cập nhật lệnh chi');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = auth.currentUser.email;
      await db.collection('paymentOrders').add(data);
      toast('Đã tạo lệnh chi');
    }
    closeModal('modal-order');
  }catch(err){ toast('Lỗi: '+err.message); }
});

// ---------------- Duyệt lệnh chi (Giám đốc) — dùng chung cho bảng + modal ----------------
async function decideOrderApproval(id, decision){
  const o = ORDERS.find(x=>x.id===id);
  if(!o) return;
  const label = decision==='approved' ? 'DUYỆT' : 'TỪ CHỐI';
  if(!confirm(`Xác nhận ${label} lệnh chi "${o.reason}" — ${fmtVND(o.amount)}?`)) return;
  try{
    await db.collection('paymentOrders').doc(id).update({
      approvalStatus: decision,
      approvedBy: auth.currentUser.email,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    toast(decision==='approved' ? 'Đã duyệt lệnh chi' : 'Đã từ chối lệnh chi');

    // Duyệt xong -> tự động ghi/khớp 1 khoản Chi tương ứng (chỉ khi DUYỆT)
    // - Có chọn Dự án -> ghi vào Thu chi (transactions), gắn đúng dự án.
    // - KHÔNG chọn Dự án (để trống) -> ghi vào Chi phí gián tiếp (fixedCosts).
    //   Riêng loại "Tạm ứng thanh toán"/"Tạm ứng lương" không có dự án thì mặc định gắn mã INDIRECT.
    if(decision === 'approved'){
      const hasProject = !!o.projectId;
      const isAdvance = o.orderType === 'advance_purchase' || o.orderType === 'advance_salary';
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
        note:`Tự động tạo từ Lệnh chi (${o.payee})${o.payeeTaxCode ? ' — MST: '+o.payeeTaxCode : ''}`,
      };
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

function getFilteredOrders(){
  const status = document.getElementById('ord-filter-status').value;
  const project = document.getElementById('ord-filter-project').value;
  return ORDERS.filter(o=>{
    if(status && (o.approvalStatus||'none')!==status) return false;
    if(project && o.projectId!==project) return false;
    return true;
  });
}

function renderOrdersTable(){
  const table = document.getElementById('orders-table');
  if(!table) return;
  const rows = getFilteredOrders();
  if(rows.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">📝</div>Chưa có lệnh chi nào.</div></td></tr>`;
    return;
  }
  const myEmail = (auth.currentUser && auth.currentUser.email || '').toLowerCase();
  table.innerHTML = `<thead><tr>
    <th>Ngày</th><th>Loại</th><th>Người nhận</th><th>Lý do</th><th>Dự án</th><th>Số tiền</th><th>Duyệt</th><th></th>
  </tr></thead><tbody>${rows.map(o=>{
    let approveActions = '';
    if((o.approvalStatus||'none')==='pending' && myEmail && o.approverEmail && myEmail===o.approverEmail.toLowerCase()){
      approveActions = `<button class="icon-btn" data-approve-order="${o.id}" title="Duyệt">✅</button><button class="icon-btn" data-reject-order="${o.id}" title="Từ chối">❌</button>`;
    }
    return `
    <tr>
      <td>${fmtDate(o.date)}</td>
      <td>${escapeHtml(ORDER_TYPE_LABELS[o.orderType] || 'Thanh toán chi phí')}</td>
      <td><strong>${escapeHtml(o.payee)}</strong></td>
      <td>${escapeHtml(o.reason)}</td>
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
  }).join('')}</tbody>`;
}

function printOrder(id){
  const o = ORDERS.find(x=>x.id===id);
  if(!o) return;
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Lệnh chi</title>
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
    <div class="center">CÔNG TY .....................................<br>Số: ...... /LC</div>
    <h2>LỆNH CHI</h2>
    <div class="center">${escapeHtml(ORDER_TYPE_LABELS[o.orderType] || 'Thanh toán chi phí')} — Ngày ${fmtDate(o.date)}</div>
    <table>
      <tr><td class="lbl">Người/đơn vị chi:</td><td>${escapeHtml(o.payer||'—')}</td></tr>
      <tr><td class="lbl">Chi cho (đơn vị/cá nhân):</td><td>${escapeHtml(o.payee)}</td></tr>
      <tr><td class="lbl">STK nhận:</td><td>${escapeHtml(o.payeeBank||'—')}</td></tr>
      <tr><td class="lbl">MST:</td><td>${escapeHtml(o.payeeTaxCode||'—')}</td></tr>
      <tr><td class="lbl">Lý do chi:</td><td>${escapeHtml(o.reason)}</td></tr>
      <tr><td class="lbl">Dự án liên quan:</td><td>${escapeHtml(o.projectName||'—')}</td></tr>
      <tr><td class="lbl">Số tiền:</td><td><strong>${fmtVND(o.amount)}</strong></td></tr>
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

document.getElementById('orders-table').addEventListener('click', (e)=>{
  const editId = e.target.closest('[data-edit-order]')?.dataset.editOrder;
  const delId = e.target.closest('[data-del-order]')?.dataset.delOrder;
  const printId = e.target.closest('[data-print-order]')?.dataset.printOrder;
  const approveId = e.target.closest('[data-approve-order]')?.dataset.approveOrder;
  const rejectId = e.target.closest('[data-reject-order]')?.dataset.rejectOrder;
  if(editId) openOrderModal(editId);
  if(printId) printOrder(printId);
  if(approveId) decideOrderApproval(approveId, 'approved');
  if(rejectId) decideOrderApproval(rejectId, 'rejected');
  if(delId){
    if(confirmDelete('Xóa lệnh chi này? Nếu lệnh chi đã được duyệt và tự động ghi vào Thu chi, khoản chi tương ứng cũng sẽ bị xóa theo.')){
      const ord = ORDERS.find(x=>x.id===delId);
      db.collection('paymentOrders').doc(delId).delete().then(async ()=>{
        if(ord && ord.transactionId){
          try{ await db.collection(ord.transactionCollection || 'transactions').doc(ord.transactionId).delete(); }catch(e){}
        }
        toast('Đã xóa lệnh chi');
      });
    }
  }
});

['ord-filter-status','ord-filter-project'].forEach(id=>{
  document.getElementById(id).addEventListener('change', renderOrdersTable);
});
