// =============================================================
// PAYMENT ORDERS (LỆNH CHI) MODULE
// =============================================================

let ORDERS = [];

function listenOrders(){
  db.collection('paymentOrders').orderBy('date','desc').onSnapshot((snap)=>{
    ORDERS = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    renderOrdersTable();
  }, (err)=> console.error('orders listen error', err));
}

function openOrderModal(id){
  document.getElementById('order-modal-title').textContent = id ? 'Sửa lệnh chi' : 'Tạo lệnh chi';
  document.getElementById('order-id').value = id || '';
  const o = id ? ORDERS.find(x=>x.id===id) : {};
  document.getElementById('order-date').value = o.date || todayISO();
  document.getElementById('order-project').value = o.projectId || '';
  document.getElementById('order-code').value = o.code || '';
  document.getElementById('order-type').value = o.orderType || 'payment';
  document.getElementById('order-payer').value = o.payer || '';
  document.getElementById('order-payee').value = o.payee || '';
  document.getElementById('order-payee-bank').value = o.payeeBank || '';
  document.getElementById('order-payee-tax').value = o.payeeTaxCode || '';
  document.getElementById('order-reason').value = o.reason || '';
  setMoneyInputValue(document.getElementById('order-amount'), o.amount);
  document.getElementById('order-status').value = o.status || 'pending';
  document.getElementById('order-requester').value = o.requester || (auth.currentUser ? auth.currentUser.email : '');
  document.getElementById('order-approver').value = o.approver || '';
  document.getElementById('order-note').value = o.note || '';
  const statusField = document.getElementById('order-status');
  statusField.disabled = !isAdmin();
  if(!isAdmin() && !id) statusField.value = 'pending';
  document.getElementById('order-status-hint').style.display = isAdmin() ? 'none' : 'block';
  openModal('modal-order');
}

document.getElementById('btn-add-order')?.addEventListener('click', ()=> openOrderModal(null));

document.getElementById('save-order-btn').addEventListener('click', async ()=>{
  const id = document.getElementById('order-id').value;
  const payee = document.getElementById('order-payee').value.trim();
  const reason = document.getElementById('order-reason').value.trim();
  const amount = parseMoneyInput(document.getElementById('order-amount'));
  const date = document.getElementById('order-date').value;
  if(!payee || !reason || !amount || !date){ toast('Vui lòng nhập đủ thông tin bắt buộc (*)'); return; }

  const projectId = document.getElementById('order-project').value;
  const proj = projectId ? projectById(projectId) : null;
  const status = document.getElementById('order-status').value;
  const data = {
    date, projectId: projectId || null, projectName: proj ? proj.name : '',
    code: document.getElementById('order-code').value,
    orderType: document.getElementById('order-type').value,
    payer: document.getElementById('order-payer').value.trim(),
    payee, reason, amount, status,
    payeeBank: document.getElementById('order-payee-bank').value.trim(),
    payeeTaxCode: document.getElementById('order-payee-tax').value.trim(),
    requester: document.getElementById('order-requester').value.trim(),
    approver: document.getElementById('order-approver').value.trim(),
    note: document.getElementById('order-note').value.trim(),
  };
  try{
    let orderId = id;
    let existingTxId = null;
    if(id){
      const existing = ORDERS.find(x=>x.id===id);
      existingTxId = existing ? existing.transactionId : null;
      await db.collection('paymentOrders').doc(id).update(data);
      toast('Đã cập nhật lệnh chi');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = auth.currentUser.email;
      const ref = await db.collection('paymentOrders').add(data);
      orderId = ref.id;
      toast('Đã tạo lệnh chi');
    }

    // Lệnh chi "Đã duyệt" -> tự động ghi/khớp 1 khoản Chi tương ứng trong Thu chi
    if(status === 'approved'){
      const txData = {
        type:'OUT',
        projectId: data.projectId, projectName: data.projectName,
        date: data.date, code: data.code || '',
        content: data.reason,
        description: `Chi cho ${data.payee}` + (data.payer ? ` (từ ${data.payer})` : '') + (data.note ? ' — '+data.note : ''),
        unit:'', qty:0, unitPrice:0, amount: data.amount,
        invoiceNumber:'', invoiceDate:'',
        bankName:'', bankAccount: data.payeeBank||'', bankHolder: data.payee||'', transferDate:'',
        note:`Tự động tạo từ Lệnh chi (${data.payee})${data.payeeTaxCode ? ' — MST: '+data.payeeTaxCode : ''}`,
      };
      if(existingTxId){
        await db.collection('transactions').doc(existingTxId).update(txData);
      } else {
        txData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        txData.createdBy = auth.currentUser.email;
        const txRef = await db.collection('transactions').add(txData);
        await db.collection('paymentOrders').doc(orderId).update({transactionId: txRef.id});
      }
    }
    closeModal('modal-order');
  }catch(err){ toast('Lỗi: '+err.message); }
});

function statusTag(status){
  if(status==='approved') return '<span class="tag tag-in">Đã duyệt</span>';
  return '<span class="tag tag-gold">Chờ duyệt</span>';
}

function getFilteredOrders(){
  const status = document.getElementById('ord-filter-status').value;
  const project = document.getElementById('ord-filter-project').value;
  return ORDERS.filter(o=>{
    if(status && o.status!==status) return false;
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
  table.innerHTML = `<thead><tr>
    <th>Ngày</th><th>Người nhận</th><th>Lý do</th><th>Dự án</th><th>Số tiền</th><th>Trạng thái</th><th></th>
  </tr></thead><tbody>${rows.map(o=>`
    <tr>
      <td>${fmtDate(o.date)}</td>
      <td><strong>${escapeHtml(o.payee)}</strong></td>
      <td>${escapeHtml(o.reason)}</td>
      <td>${escapeHtml(o.projectName||'—')}</td>
      <td class="num"><strong>${fmtVND(o.amount)}</strong></td>
      <td>${statusTag(o.status)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-print-order="${o.id}" title="In">🖨</button>
          <button class="icon-btn" data-edit-order="${o.id}" title="Sửa">✎</button>
          ${isAdmin() ? `<button class="icon-btn" data-del-order="${o.id}" title="Xóa">🗑</button>` : ''}
        </div>
      </td>
    </tr>`).join('')}</tbody>`;
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
    <div class="center">Ngày ${fmtDate(o.date)}</div>
    <table>
      <tr><td class="lbl">Chi cho (đơn vị/cá nhân):</td><td>${escapeHtml(o.payee)}</td></tr>
      <tr><td class="lbl">Lý do chi:</td><td>${escapeHtml(o.reason)}</td></tr>
      <tr><td class="lbl">Dự án liên quan:</td><td>${escapeHtml(o.projectName||'—')}</td></tr>
      <tr><td class="lbl">Số tiền:</td><td><strong>${fmtVND(o.amount)}</strong></td></tr>
      <tr><td class="lbl">Ghi chú:</td><td>${escapeHtml(o.note||'—')}</td></tr>
    </table>
    <div class="sig">
      <div><strong>Người đề nghị</strong><br><br><br>${escapeHtml(o.requester||'')}</div>
      <div><strong>Kế toán trưởng</strong><br><br><br></div>
      <div><strong>Giám đốc duyệt chi</strong><br><br><br>${escapeHtml(o.approver||'')}</div>
    </div>
    </body></html>`);
  w.document.close();
  w.print();
}

document.getElementById('orders-table').addEventListener('click', (e)=>{
  const editId = e.target.closest('[data-edit-order]')?.dataset.editOrder;
  const delId = e.target.closest('[data-del-order]')?.dataset.delOrder;
  const printId = e.target.closest('[data-print-order]')?.dataset.printOrder;
  if(editId) openOrderModal(editId);
  if(printId) printOrder(printId);
  if(delId){
    if(confirmDelete('Xóa lệnh chi này? Nếu lệnh chi đã được duyệt và tự động ghi vào Thu chi, khoản chi tương ứng cũng sẽ bị xóa theo.')){
      const ord = ORDERS.find(x=>x.id===delId);
      db.collection('paymentOrders').doc(delId).delete().then(async ()=>{
        if(ord && ord.transactionId){
          try{ await db.collection('transactions').doc(ord.transactionId).delete(); }catch(e){}
        }
        toast('Đã xóa lệnh chi');
      });
    }
  }
});

['ord-filter-status','ord-filter-project'].forEach(id=>{
  document.getElementById(id).addEventListener('change', renderOrdersTable);
});
