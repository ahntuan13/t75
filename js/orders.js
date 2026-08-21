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
let currentOrderAttachment = ''; // base64 data URL của file đính kèm (mọi loại file)
let currentOrderAttachmentName = '';

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
  // Lệnh chi (Thanh toán chi phí) không cần chọn Loại lệnh chi (chỉ 1 lựa chọn); Đính kèm chỉ dành cho Lệnh chi;
  // Giải chi + đính kèm không cần nữa ở Lệnh tạm ứng vì đã có luồng "🧾 Giải chi" riêng (5 khung, đầy đủ hơn).
  document.getElementById('order-type-field').style.display = effectiveContext === 'advance' ? '' : 'none';
  document.getElementById('order-explanation-field').style.display = 'none';
  document.getElementById('order-attachment-field').style.display = effectiveContext === 'advance' ? 'none' : '';

  document.getElementById('order-modal-title').textContent = id
    ? (effectiveContext === 'advance' ? 'Sửa lệnh tạm ứng' : 'Sửa lệnh chi')
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
  currentOrderAttachment = o.attachment || '';
  currentOrderAttachmentName = o.attachmentName || '';
  document.getElementById('order-attachment-input').value = '';
  renderOrderAttachmentStatus();
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

function renderOrderAttachmentStatus(){
  const el = document.getElementById('order-attachment-status');
  if(!el) return;
  if(currentOrderAttachment){
    el.innerHTML = `<a href="${currentOrderAttachment}" target="_blank" class="tag tag-blue">📎 ${escapeHtml(currentOrderAttachmentName||'Xem file')}</a> <button type="button" class="btn btn-ghost btn-sm" id="order-attachment-remove">Xóa file</button>`;
    document.getElementById('order-attachment-remove').addEventListener('click', ()=>{
      currentOrderAttachment = ''; currentOrderAttachmentName = '';
      document.getElementById('order-attachment-input').value = '';
      renderOrderAttachmentStatus();
    });
  } else {
    el.innerHTML = `<span class="helper-text">Chưa có file đính kèm.</span>`;
  }
}
document.getElementById('order-attachment-input')?.addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  if(file.size > 2*1024*1024){
    toast('File quá lớn (>2MB), vui lòng chọn file nhỏ hơn');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = ()=>{
    currentOrderAttachment = reader.result;
    currentOrderAttachmentName = file.name;
    renderOrderAttachmentStatus();
  };
  reader.onerror = ()=> toast('Không đọc được file');
  reader.readAsDataURL(file);
});

document.getElementById('btn-add-order')?.addEventListener('click', ()=> openOrderModal(null, 'payment'));
document.getElementById('btn-add-advance')?.addEventListener('click', ()=> openOrderModal(null, 'advance'));

function renderOrderApprovalCurrentStatus(o){
  const el = document.getElementById('order-approval-current-status');
  if(!el) return;
  const roleLabel = 'Giám đốc';
  const myEmail = (auth.currentUser && auth.currentUser.email || '').toLowerCase();
  const canDecide = o.approvalStatus==='pending' && isAuthorizedApprover(myEmail);

  if(!o.approvalStatus || o.approvalStatus==='none'){ el.textContent = 'Chưa gửi duyệt.'; return; }

  if(o.approvalStatus==='pending'){
    el.innerHTML = `🟡 Đang chờ 1 trong 2 người duyệt (${escapeHtml((APPROVERS.approverEmails||[]).join(', '))}) xử lý.` +
      (canDecide ? `<div style="margin-top:10px;display:flex;gap:8px;">
          <button type="button" class="btn btn-primary btn-sm" id="order-modal-approve-btn">✅ Duyệt</button>
          <button type="button" class="btn btn-ghost btn-sm" id="order-modal-reject-btn">❌ Từ chối</button>
        </div>` : '');
    if(canDecide){
      document.getElementById('order-modal-approve-btn').addEventListener('click', async ()=>{
        await decideOrderApproval(o.id, 'approved');
        closeModal('modal-order');
      });
      document.getElementById('order-modal-reject-btn').addEventListener('click', async ()=>{
        await decideOrderApproval(o.id, 'rejected');
        closeModal('modal-order');
      });
    }
  }
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
    attachment: currentOrderAttachment,
    attachmentName: currentOrderAttachmentName,
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
    const orderUpdate = {
      approvalStatus: decision,
      approvedBy: auth.currentUser.email,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if(decision === 'approved'){
      const hasProject = !!o.projectId;
      const isAdvance = isAdvanceOrder(o);
      const targetCollection = hasProject ? 'transactions' : 'fixedCosts';
      const txData = {
        type:'OUT',
        projectId: hasProject ? o.projectId : '', projectName: hasProject ? (o.projectName || '') : '',
        date: o.date, code: hasProject ? (o.code || '') : (o.code || 'INDIRECT'),
        content: o.reason,
        description: `Chi cho ${o.payee}` + (o.payer ? ` (từ ${o.payer})` : '') + (o.note ? ' — '+o.note : ''),
        unit:'', qty:0, unitPrice:0, amount: o.amount,
        invoiceNumber:'', invoiceDate:'',
        bankName:'', bankAccount: o.payeeBank||'', bankHolder: o.payee||'', transferDate:'',
        note:`Tự động tạo từ ${isAdvance ? 'Lệnh tạm ứng' : 'Lệnh chi'} (${o.payee})${o.payeeTaxCode ? ' — MST: '+o.payeeTaxCode : ''}`,
      };
      // Tạm ứng (dù CÓ hay KHÔNG có dự án lúc duyệt) đều gắn tag "Chờ giải chi" — số tiền ban đầu chỉ là
      // TẠM (dự kiến), phải chờ KT bấm Giải chi ghi rõ dự án/số tiền chính thức mới coi là số liệu cuối cùng.
      // Không gắn dự án -> vào Chi phí gián tiếp. Có gắn dự án -> vào thẳng Thu Chi dự án nhưng vẫn "Chờ giải chi".
      if(isAdvance){
        txData.advanceExplainStatus = 'pending';
      }
      if(o.transactionId){
        // QUAN TRỌNG: cập nhật đúng NƠI giao dịch liên kết ĐANG THỰC SỰ NẰM (o.transactionCollection),
        // không phải nơi tính toán lại theo trạng thái Dự án hiện tại — tránh việc ghi nhầm vào 1 collection
        // khác nơi ID đó thực ra không tồn tại (VD: lệnh cũ tạo trước khi có Chi phí gián tiếp).
        await db.collection(o.transactionCollection || 'transactions').doc(o.transactionId).update(txData);
      } else {
        txData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        txData.createdBy = auth.currentUser.email;
        const txRef = await db.collection(targetCollection).add(txData);
        // Ghi CHUNG 1 LẦN với approvalStatus (không tách 2 lần update như trước) — tránh trường hợp
        // lần ghi thứ 2 bị luật Firestore từ chối do không đúng bộ trường cho phép.
        orderUpdate.transactionId = txRef.id;
        orderUpdate.transactionCollection = targetCollection;
      }
    }

    await db.collection('paymentOrders').doc(id).update(orderUpdate);
    toast(decision==='approved' ? 'Đã duyệt' : 'Đã từ chối');
    logActivity('approval_decide', {projectName: isAdvanceOrder(o)?'Lệnh tạm ứng':'Lệnh chi', content: o.reason, amount: o.amount, type:'OUT', note: decision==='approved'?'Đã duyệt':'Đã từ chối'});
  }catch(err){ toast('Lỗi: '+err.message); }
}

// Kiểm tra + sửa liên kết cho ĐÚNG 1 lệnh cụ thể — dùng khi nghi ngờ 1 lệnh bị "lạc" (đã duyệt nhưng
// giao dịch liên kết không nằm đúng chỗ). KHÔNG đoán mò — tự đi kiểm tra thật cả 2 collection.
async function repairOrderLink(orderId){
  const o = ORDERS.find(x=>x.id===orderId);
  if(!o || !o.transactionId) return;
  toast('Đang kiểm tra...');
  try{
    const txSnap = await db.collection('transactions').doc(o.transactionId).get();
    const fcSnap = await db.collection('fixedCosts').doc(o.transactionId).get();
    let report = `Lệnh: "${o.reason}" — ${fmtVND(o.amount)}\n`
      + `transactionId lưu trong lệnh: ${o.transactionId}\n`
      + `transactionCollection lưu trong lệnh: ${o.transactionCollection || '(chưa có — lệnh cũ)'}\n\n`
      + `Kiểm tra thật trong Firestore:\n`
      + `- Có tồn tại trong "transactions"? ${txSnap.exists ? '✅ CÓ' : '❌ Không'}\n`
      + `- Có tồn tại trong "fixedCosts"? ${fcSnap.exists ? '✅ CÓ' : '❌ Không'}\n`;

    if(!o.projectId && txSnap.exists && !fcSnap.exists){
      // Đúng là đang bị lạc trong Thu Chi -> chuyển sang Chi phí gián tiếp ngay
      if(!isAdmin()){
        alert(report + '\n⚠️ Lệnh này ĐANG NẰM SAI trong Thu Chi (Chi phí gián tiếp), cần chuyển — nhưng chỉ Admin mới xóa được khỏi Thu Chi. Vui lòng đăng nhập Admin rồi bấm 🔧 lại.');
        return;
      }
      if(!confirm(report + '\n➡️ Lệnh này ĐANG NẰM SAI trong Thu Chi. Bấm OK để CHUYỂN ngay sang Chi phí gián tiếp và sửa lại liên kết.')) return;
      const txData = txSnap.data();
      const newRef = db.collection('fixedCosts').doc();
      await newRef.set({ ...txData, projectId:'', projectName:'', code: txData.code || 'INDIRECT' });
      await db.collection('transactions').doc(o.transactionId).delete();
      await db.collection('paymentOrders').doc(orderId).update({ transactionId: newRef.id, transactionCollection: 'fixedCosts' });
      toast('✅ Đã sửa xong — giờ đã đúng nằm trong Chi phí gián tiếp');
    } else if(!txSnap.exists && !fcSnap.exists){
      // Không tìm thấy ở đâu cả -> tạo lại mới hoàn toàn từ dữ liệu lệnh gốc
      if(!confirm(report + '\n⚠️ KHÔNG tìm thấy giao dịch liên kết ở bất kỳ đâu (có thể đã bị xóa nhầm trước đó). Bấm OK để TẠO LẠI mới trong Chi phí gián tiếp từ đúng thông tin lệnh gốc.')) return;
      const targetCollection = o.projectId ? 'transactions' : 'fixedCosts';
      const newRef = db.collection(targetCollection).doc();
      await newRef.set({
        type:'OUT', projectId: o.projectId||'', projectName: o.projectName||'',
        date: o.date, code: o.code || (o.projectId?'':'INDIRECT'),
        content: o.reason, description: `Chi cho ${o.payee}`,
        unit:'', qty:0, unitPrice:0, amount: o.amount,
        invoiceNumber:'', invoiceDate:'', bankName:'', bankAccount: o.payeeBank||'', bankHolder: o.payee||'', transferDate:'',
        note:`Tạo lại từ Lệnh chi (${o.payee}) — sửa liên kết bị lạc`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: auth.currentUser.email,
      });
      await db.collection('paymentOrders').doc(orderId).update({ transactionId: newRef.id, transactionCollection: targetCollection });
      toast('✅ Đã tạo lại giao dịch mới đúng chỗ');
    } else {
      alert(report + '\n✅ Dữ liệu đang ở đúng chỗ hợp lý, không cần sửa gì thêm. Nếu vẫn không thấy trên giao diện, thử Ctrl+Shift+R để tải lại trang.');
    }
  }catch(err){
    alert('Lỗi khi kiểm tra: ' + err.message);
  }
}

function statusTag(o){
  const status = o.approvalStatus || 'none';
  if(status==='approved'){
    // Tạm ứng đã duyệt nhưng chưa giải trình xong -> "Đã duyệt, chờ giải chi" (rõ ràng hơn cho KT)
    if(isAdvanceOrder(o) && !(o.explanation && o.explanation.trim())){
      return '<span class="tag tag-in">✅ Đã duyệt, chờ giải chi</span>';
    }
    return '<span class="tag tag-in">✅ Đã duyệt</span>';
  }
  if(status==='rejected') return '<span class="tag tag-out">❌ Từ chối</span>';
  if(status==='pending') return '<span class="tag tag-gold">🟡 Chờ duyệt</span>';
  return '<span class="tag tag-gray">Chưa gửi duyệt</span>';
}

// ---------------- IN PHIẾU "ĐỀ XUẤT CHI PHÍ" (theo đúng mẫu công ty) ----------------
// Dùng chung cho in 1 lệnh (nút 🖨 từng dòng) hoặc in gộp nhiều lệnh cùng lúc (đã chọn checkbox).
// Nếu 1 lệnh đã có "Giải chi" (nhiều dự án), mỗi khoản phân bổ sẽ tách thành 1 dòng riêng trong phiếu.
const COMPANY_HEADER = {
  name: 'TUAN 75 INSULATION TECHNICAL SERVICES CO.,LTD',
  address: 'Add: Group 9, Thanh Phu Quarter, Tan Trieu Ward, Dong Nai City, Vietnam',
  bank: 'Bank number: 0914 288 146 – Eximbank – Dong Nai',
  tel: 'Tell: 0914 288 146   Tax: 3604002848',
  email: 'Email: tuan75cachnhiet@gmail.com',
  logo: 'data:image/png;base64,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',
};

// Chữ ký cố định (Người lập phiếu + Kế toán luôn có sẵn; chữ ký + con dấu Giám đốc chỉ hiện khi
// (các) lệnh được in đã thực sự ĐƯỢC DUYỆT — tránh in khống chữ ký GĐ cho lệnh chưa duyệt).
const SIGNATURES = {
  preparer: { name: 'Diễm My', img: 'data:image/png;base64,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' },
  accountant: { name: 'Hoài Thương', img: 'data:image/png;base64,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' },
  director: { name: 'Hoàng Tuấn', img: 'data:image/png;base64,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' },
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
  // Chữ ký GĐ + con dấu CHỈ hiện khi toàn bộ (các) lệnh đang in đã thực sự được Duyệt.
  const allApproved = orders.every(o => o.approvalStatus === 'approved');

  const html = `
    <html><head><title>Đề xuất chi phí ${docNo}</title>
    <style>
      @page{size:A4 landscape;margin:14mm;}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12.5px;margin:0;}
      .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #7a1f1f;padding-bottom:10px;}
      .header-left{display:flex;align-items:center;gap:14px;}
      .header-left img{height:56px;}
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
      .sig{display:flex;justify-content:space-between;margin-top:36px;text-align:center;}
      .sig div.col{width:31%;}
      .sig .role{font-weight:700;}
      .sig .hint{font-size:10.5px;color:#666;}
      .sig .space{height:64px;display:flex;align-items:center;justify-content:center;}
      .sig .space img{max-height:64px;max-width:100%;}
      .sig .name{font-size:12.5px;}
    </style></head><body>
    <div class="header">
      <div class="header-left">
        <img src="${COMPANY_HEADER.logo}">
        <div>
          <div class="co-name">${COMPANY_HEADER.name}</div>
          <div class="co-info">
            ${COMPANY_HEADER.address}<br>
            ${COMPANY_HEADER.bank}<br>
            ${COMPANY_HEADER.tel}<br>
            ${COMPANY_HEADER.email}
          </div>
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
      <div class="col">
        <div class="role">Người lập phiếu</div><div class="hint">(Ký, họ tên)</div>
        <div class="space"><img src="${SIGNATURES.preparer.img}"></div>
        <div class="name">${escapeHtml(SIGNATURES.preparer.name)}</div>
      </div>
      <div class="col">
        <div class="role">Kế toán</div><div class="hint">(Ký, họ tên)</div>
        <div class="space"><img src="${SIGNATURES.accountant.img}"></div>
        <div class="name">${escapeHtml(SIGNATURES.accountant.name)}</div>
      </div>
      <div class="col">
        <div class="role">Giám đốc</div><div class="hint">(Ký, họ tên, đóng dấu)</div>
        <div class="space">${allApproved ? `<img src="${SIGNATURES.director.img}">` : ''}</div>
        <div class="name">${allApproved ? escapeHtml(SIGNATURES.director.name) : '<span style="color:#999;font-style:italic;">Chưa duyệt</span>'}</div>
      </div>
    </div>
    </body></html>`;

  // In ngay trong khung hiện tại (iframe ẩn) — KHÔNG mở tab/cửa sổ mới.
  let frame = document.getElementById('print-order-frame');
  if(!frame){
    frame = document.createElement('iframe');
    frame.id = 'print-order-frame';
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
  }
  const doc = frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  frame.onload = null;
  setTimeout(()=>{
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }, 250);
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
  // Cột "Duyệt" riêng, tách khỏi cột Trạng thái và khỏi nhóm icon Sửa/Xem/Xóa —
  // GĐ/PGĐ (bất kỳ ai trong danh sách approverEmails) bấm thẳng từ bảng, không cần mở Sửa lệnh.
  let approveCell = '';
  if((o.approvalStatus||'none')==='pending' && myEmail && isAuthorizedApprover(myEmail)){
    approveCell = `<button class="icon-btn" data-approve-order="${o.id}" title="Duyệt">✅</button><button class="icon-btn" data-reject-order="${o.id}" title="Từ chối">❌</button>`;
  }
  return `<tr${o.transactionId ? ' class="tx-row-explained"' : ''}>
      <td><input type="checkbox" class="order-select-cb" data-order-id="${o.id}"></td>
      <td>${fmtDate(o.date)}</td>
      <td>${escapeHtml(ORDER_TYPE_LABELS[o.orderType] || 'Thanh toán chi phí')}</td>
      <td><strong>${escapeHtml(o.payee)}</strong></td>
      <td>${escapeHtml(o.reason)}</td>
      <td>${escapeHtml(o.projectName||'—')}</td>
      <td class="num"><strong>${fmtVND(o.amount)}</strong></td>
      <td>${statusTag(o)}</td>
      <td class="order-approve-cell">${approveCell}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-view-order="${o.id}" title="Xem chi tiết">👁</button>
          <button class="icon-btn" data-print-order="${o.id}" title="In">🖨</button>
          <button class="icon-btn" data-edit-order="${o.id}" title="Sửa">✎</button>
          ${(isAdvanceOrder(o) && !isSubAdmin()) ? `<button class="icon-btn" data-explain-order="${o.id}" title="Giải chi (chỉ Kế toán)">🧾</button>` : ''}
          ${(o.transactionId && !o.projectId && isAdmin()) ? `<button class="icon-btn" data-repair-order="${o.id}" title="Kiểm tra/Sửa liên kết Chi phí gián tiếp">🔧</button>` : ''}
          <button class="icon-btn" data-del-order="${o.id}" title="Xóa">🗑</button>
        </div>
      </td>
    </tr>`;
}
const ORDER_THEAD = `<thead><tr>
    <th></th><th>Ngày</th><th>Loại</th><th>Người nhận</th><th>Lý do</th><th>Dự án</th><th>Số tiền</th><th>Trạng thái</th><th>Duyệt</th><th></th>
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
  const viewId = e.target.closest('[data-view-order]')?.dataset.viewOrder;
  const editId = e.target.closest('[data-edit-order]')?.dataset.editOrder;
  const delId = e.target.closest('[data-del-order]')?.dataset.delOrder;
  const printId = e.target.closest('[data-print-order]')?.dataset.printOrder;
  const approveId = e.target.closest('[data-approve-order]')?.dataset.approveOrder;
  const rejectId = e.target.closest('[data-reject-order]')?.dataset.rejectOrder;
  const explainId = e.target.closest('[data-explain-order]')?.dataset.explainOrder;
  const repairId = e.target.closest('[data-repair-order]')?.dataset.repairOrder;
  if(repairId) repairOrderLink(repairId);
  if(viewId){
    const o = ORDERS.find(x=>x.id===viewId);
    openOrderModal(viewId, o && isAdvanceOrder(o) ? 'advance' : 'payment');
  }
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
// Mỗi khung "Giải chi N" có Dự án riêng -> khi lưu, tự tạo 1 khoản Chi (Thu Chi)
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
    if(!amount) continue; // khung hoàn toàn trống (không nhập số tiền) -> bỏ qua
    // KHÔNG chọn dự án vẫn phải tính — sẽ tự động rơi vào Chi phí gián tiếp (mã INDIRECT), y hệt Lệnh chi thường.
    const proj = projectId ? projectById(projectId) : null;
    blocks.push({
      projectId: projectId || '', projectName: proj ? proj.name : '',
      code: document.getElementById(`exp${i}-code`).value || (projectId ? '' : 'INDIRECT'),
      content: document.getElementById(`exp${i}-content`).value.trim() || o.reason,
      description: document.getElementById(`exp${i}-desc`).value.trim(),
      unit: document.getElementById(`exp${i}-unit`).value.trim(),
      qty: Number(document.getElementById(`exp${i}-qty`).value) || 1,
      unitPrice: parseMoneyInput(document.getElementById(`exp${i}-price`)),
      amount,
    });
  }
  if(blocks.length === 0){ toast('Vui lòng điền ít nhất 1 khung Giải chi (nhập Số tiền)'); return; }

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
      const hasProject = !!b.projectId;
      const targetCollection = hasProject ? 'transactions' : 'fixedCosts';
      const ref = db.collection(targetCollection).doc();
      const txData = {
        type:'OUT', projectId: b.projectId, projectName: b.projectName,
        date, code: b.code, content: b.content, description: b.description,
        unit: b.unit, qty: b.qty, unitPrice: b.unitPrice, amount: b.amount,
        invoiceNumber:'', invoiceDate:'', bankName:'', bankAccount:'', bankHolder:'', transferDate:'',
        note: `Giải chi từ Lệnh tạm ứng (${o.payee}) — ${o.reason}`,
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

    // Đánh dấu bản ghi TẠM (dự kiến) ban đầu là "đã giải chi" — bất kể nó đang nằm ở Thu Chi hay Chi phí
    // gián tiếp — để loại khỏi mọi tổng tính toán (số liệu chính thức giờ nằm ở các khoản Giải chi vừa tạo,
    // tránh tính trùng tiền 2 lần).
    if(o.transactionId){
      const originalCollection = o.transactionCollection || 'transactions';
      try{
        await db.collection(originalCollection).doc(o.transactionId).update({
          advanceExplainStatus: 'explained',
          movedToTransactionId: orderId,
          explainedAt: firebase.firestore.FieldValue.serverTimestamp(),
          explainedBy: auth.currentUser.email,
        });
      }catch(err){ console.error('mark explained error', err); }
    }

    toast(`✅ Đã giải trình xong — tạo ${blocks.length} khoản Chi phân bổ theo dự án`);
    logActivity('update', {projectName:'Giải chi tạm ứng', content: o.reason, amount: blocks.reduce((s,b)=>s+b.amount,0), type:'OUT'});
    closeModal('modal-order-explain');
  }catch(err){ toast('Lỗi: '+err.message); }
});
