// =============================================================
// CHI PHÍ CỐ ĐỊNH — Thu/Chi không gắn dự án cụ thể
// (chi phí gián tiếp/INDIRECT, tạm ứng mua hàng, tạm ứng lương...)
// Dùng lại gần như y hệt logic của Thu Chi (transactions.js) nhưng
// lưu vào collection riêng "fixedCosts" để không lẫn vào báo cáo
// theo dự án.
// =============================================================

let FIXEDCOSTS = [];

function listenFixedCosts(){
  db.collection('fixedCosts').orderBy('date','desc').onSnapshot((snap)=>{
    FIXEDCOSTS = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    renderFixedCostsTable();
    if(window.renderApprovalBanner) renderApprovalBanner();
    if(window.renderNotifications) renderNotifications();
    if(window.renderDashboard) renderDashboard();
    if(window.renderReports) renderReports();
    if(window.renderPnl) renderPnl();
  }, (err)=> console.error('fixedCosts listen error', err));
}

document.getElementById('btn-add-fc')?.addEventListener('click', ()=> openTxModal(null, null, 'fixedCosts'));

// Chi phí gián tiếp "đang thực tính" — loại bỏ các khoản tạm ứng ĐÃ GIẢI TRÌNH (đã chuyển hẳn sang Thu Chi)
// để không bị tính trùng. Dùng hàm này ở MỌI nơi cần tính tổng Chi phí gián tiếp (kể cả Dashboard/Báo cáo).
function activeFixedCosts(){
  return FIXEDCOSTS.filter(t => t.advanceExplainStatus !== 'explained');
}

function getFilteredFixedCosts(){
  const type = document.getElementById('fc-filter-type').value;
  const code = document.getElementById('fc-filter-code').value;
  const month = document.getElementById('fc-filter-month').value;
  const search = document.getElementById('fc-search').value.trim().toLowerCase();
  return FIXEDCOSTS.filter(t=>{
    if(type && t.type!==type) return false;
    if(code && t.code!==code) return false;
    if(month && monthKey(t.date)!==month) return false;
    if(search && !(`${t.content} ${t.description} ${t.code}`.toLowerCase().includes(search))) return false;
    return true;
  });
}

function renderFixedCostsTable(){
  const wrap = document.getElementById('fc-table');
  if(!wrap) return;
  const rows = getFilteredFixedCosts();
  if(rows.length===0){
    wrap.innerHTML = `<div class="card"><div class="empty-state"><div class="big">🏢</div>Chưa có chi phí gián tiếp nào phù hợp bộ lọc.</div></div>`;
    return;
  }
  const sorted = rows.slice().sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  // Tổng chỉ tính các khoản CHƯA giải trình (khoản đã giải trình được tính bên Thu Chi rồi, tránh trùng)
  const activeSorted = sorted.filter(t => t.advanceExplainStatus !== 'explained');
  const sumIn = activeSorted.filter(t=>t.type==='IN').reduce((s,t)=>s+Number(t.amount||0),0);
  const sumOut = activeSorted.filter(t=>t.type==='OUT').reduce((s,t)=>s+Number(t.amount||0),0);
  const theadHtml = `<thead><tr>
    <th>Ngày</th><th>Loại</th><th>Dự án</th><th>Nội dung</th><th>Diễn giải</th><th>Thành tiền</th><th>Hóa đơn</th><th>CK / Nhận tiền</th><th>Duyệt chi</th><th></th>
  </tr></thead>`;
  wrap.innerHTML = `
    <div class="card tx-project-block">
      <div class="tx-project-head">
        <h4>Chi phí gián tiếp (${sorted.length})</h4>
        <div class="tx-project-summary">
          <span style="color:var(--teal)">Thu: <strong>${fmtVND(sumIn)}</strong></span>
          <span style="color:var(--red)">Chi: <strong>${fmtVND(sumOut)}</strong></span>
          <span>Chênh lệch: <strong>${fmtVND(sumIn-sumOut)}</strong></span>
        </div>
      </div>
      <p class="helper-text" style="margin:-4px 0 10px;">Các khoản tạm ứng đã "🧾 Giải trình" (gạch ngang, tô xám) không được tính vào tổng trên — số liệu chính thức của chúng đã nằm trong mục Thu Chi.</p>
      <div class="table-wrap">
        <table class="data">
          ${theadHtml}
          <tbody>${sorted.map(txRowHtml).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

// Giải trình: chuyển 1 khoản tạm ứng "Chờ giải trình" sang Thu Chi — mở lại đúng form Nhập giao dịch,
// điền sẵn thông tin cũ, bắt buộc chọn Dự án/Mã và đính kèm chứng từ hóa đơn + chuyển khoản trước khi lưu.
function openExplainModal(id){
  const t = FIXEDCOSTS.find(x=>x.id===id);
  if(!t) return;
  const prefill = {
    type: 'OUT',
    date: t.date,
    content: t.content,
    description: t.description,
    amount: t.amount,
    note: t.note,
  };
  openTxModal(null, prefill, 'transactions', id);
  toast('Chọn Dự án, Mã và đính kèm hóa đơn + chuyển khoản để hoàn tất giải trình');
}

document.getElementById('fc-table')?.addEventListener('click', (e)=>{
  const viewId = e.target.closest('[data-view-tx]')?.dataset.viewTx;
  const editId = e.target.closest('[data-edit-tx]')?.dataset.editTx;
  const delId = e.target.closest('[data-del-tx]')?.dataset.delTx;
  const approveId = e.target.closest('[data-approve-tx]')?.dataset.approveTx;
  const rejectId = e.target.closest('[data-reject-tx]')?.dataset.rejectTx;
  const explainId = e.target.closest('[data-explain-tx]')?.dataset.explainTx;
  if(viewId) openTxViewModal(viewId, 'fc');
  if(editId) openTxModal(editId, null, 'fixedCosts');
  if(explainId) openExplainModal(explainId);
  if(delId){
    if(confirmDelete('Xóa khoản chi phí gián tiếp này?')){
      const t = FIXEDCOSTS.find(x=>x.id===delId);
      db.collection('fixedCosts').doc(delId).delete().then(()=>{
        toast('Đã xóa');
        if(t) logActivity('delete', {projectName:'Chi phí gián tiếp', content: t.content, amount: t.amount, type: t.type});
      });
    }
  }
  if(approveId) decideApproval(approveId, 'approved', 'fc');
  if(rejectId) decideApproval(rejectId, 'rejected', 'fc');
});

['fc-filter-type','fc-filter-code','fc-filter-month','fc-search'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input', renderFixedCostsTable);
  document.getElementById(id)?.addEventListener('change', renderFixedCostsTable);
});

// ---------------- Xuất Excel (Chi phí gián tiếp) ----------------
document.getElementById('btn-export-fc')?.addEventListener('click', ()=>{
  const rows = getFilteredFixedCosts();
  if(rows.length === 0){ toast('Không có khoản nào phù hợp bộ lọc để xuất'); return; }
  const sorted = rows.slice().sort((a,b)=> (a.date||'').localeCompare(b.date||''));
  const data = sorted.map(t => ({
    'Loại': t.type === 'IN' ? 'Thu' : 'Chi',
    'Ngày': t.date || '',
    'Mã': t.code || '',
    'Nội dung': t.content || '',
    'Diễn giải': t.description || '',
    'Thành tiền': t.amount || 0,
    'Trạng thái hóa đơn': (t.invoiceStatus||'pending')==='issued' ? 'Đã xuất' : 'Chưa xuất',
    'Ghi chú': t.note || '',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ChiPhiCoDinh');
  const stamp = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `ChiPhiCoDinh_${stamp}.xlsx`);
  toast(`Đã xuất ${rows.length} dòng ra file Excel`);
});

// ---------------- Upload Thu/Chi (Excel) cho Chi phí gián tiếp ----------------
// Dùng chung logic parse với import.js (parseImportWorkbook), chỉ khác nơi ghi dữ liệu:
// không cần khớp dự án — mọi dòng trong file đều được xem là chi phí gián tiếp.
async function runImportFixedCosts(file, type){
  if(!file) return;
  if(typeof XLSX === 'undefined'){ toast('Chưa tải được thư viện đọc Excel, thử lại sau'); return; }
  toast('Đang đọc file Excel...');
  let rows;
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array', cellDates:true});
    rows = parseImportWorkbook(wb);
  }catch(err){
    alert('Lỗi đọc file: ' + err.message);
    return;
  }
  if(rows.length === 0){
    alert('Không đọc được dòng dữ liệu nào trong file.');
    return;
  }

  const oldImported = FIXEDCOSTS.filter(t => t.type===type && t.importedFromExcel===true);
  const typeLabel = type === 'IN' ? 'THU' : 'CHI';
  const summary = `Đọc được ${rows.length} dòng trong file "${file.name}".\n\n`
    + `⚠️ Toàn bộ ${oldImported.length} dòng Chi phí gián tiếp loại ${typeLabel} đã nhập từ Excel TRƯỚC ĐÓ sẽ bị XÓA.\n`
    + `✅ Sau đó sẽ nhập mới toàn bộ ${rows.length} dòng từ file này vào mục Chi phí gián tiếp.\n\n`
    + `Bạn có chắc chắn muốn tiếp tục?`;
  if(!confirm(summary)) return;

  try{
    const CHUNK = 400;
    if(oldImported.length){
      toast(`Đang xóa ${oldImported.length} dòng cũ...`);
      for(let i = 0; i < oldImported.length; i += CHUNK){
        const batch = db.batch();
        oldImported.slice(i, i+CHUNK).forEach(t=> batch.delete(db.collection('fixedCosts').doc(t.id)));
        await batch.commit();
      }
    }
    toast(`Đang nhập ${rows.length} dòng mới...`);
    for(let i = 0; i < rows.length; i += CHUNK){
      const batch = db.batch();
      rows.slice(i, i+CHUNK).forEach(row=>{
        const ref = db.collection('fixedCosts').doc();
        batch.set(ref, {
          type, projectId:'', projectName:'',
          date: row.date, code: row.code || 'INDIRECT',
          content: row.content || '(Không có nội dung)',
          description: row.description, unit: row.unit, qty: row.qty, unitPrice: row.unitPrice,
          amount: row.amount,
          invoiceNumber:'', invoiceDate:'', bankName:'', bankAccount:'', bankHolder:'', transferDate:'',
          note: buildNoteFromExtras(row),
          invoiceImage:'', transferImage:'',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: auth.currentUser.email,
          importedFromExcel: true,
        });
      });
      await batch.commit();
    }
    toast(`✅ Đã thay mới ${rows.length} dòng Chi phí gián tiếp ${typeLabel}`);
  }catch(err){
    alert('Lỗi khi ghi dữ liệu: ' + err.message);
  }
}

document.getElementById('btn-upload-fc-thu')?.addEventListener('click', ()=> document.getElementById('upload-fc-thu-input').click());
document.getElementById('btn-upload-fc-chi')?.addEventListener('click', ()=> document.getElementById('upload-fc-chi-input').click());
document.getElementById('upload-fc-thu-input')?.addEventListener('change', (e)=>{
  const file = e.target.files[0]; e.target.value = '';
  runImportFixedCosts(file, 'IN');
});
document.getElementById('upload-fc-chi-input')?.addEventListener('change', (e)=>{
  const file = e.target.files[0]; e.target.value = '';
  runImportFixedCosts(file, 'OUT');
});

// ---------------- Chuyển dữ liệu cũ: các giao dịch project = INDIRECT trong Thu Chi -> Chi phí gián tiếp ----------------
// Chạy 1 LẦN DUY NHẤT (thủ công, Admin bấm) để dọn dữ liệu cũ đã lỡ nằm trong Thu Chi trước khi có mục này.
async function migrateIndirectToFixedCosts(){
  const indirectTx = TRANSACTIONS.filter(t => (t.projectName||'').trim().toUpperCase() === 'INDIRECT');
  if(indirectTx.length === 0){ alert('Không tìm thấy giao dịch nào thuộc dự án INDIRECT trong Thu Chi.'); return; }
  if(!confirm(`Tìm thấy ${indirectTx.length} giao dịch thuộc "INDIRECT" trong Thu Chi.\n\nBấm OK để CHUYỂN toàn bộ sang mục Chi phí gián tiếp, sau đó XÓA khỏi Thu Chi (tránh trùng lặp).\n\nThao tác này không hoàn tác được, hãy chắc chắn trước khi tiếp tục.`)) return;

  try{
    const CHUNK = 400;
    for(let i = 0; i < indirectTx.length; i += CHUNK){
      const batch = db.batch();
      indirectTx.slice(i, i+CHUNK).forEach(t=>{
        const { id, ...rest } = t;
        const ref = db.collection('fixedCosts').doc();
        batch.set(ref, { ...rest, projectId:'', projectName:'', code: rest.code || 'INDIRECT' });
        batch.delete(db.collection('transactions').doc(id));
      });
      await batch.commit();
    }
    toast(`✅ Đã chuyển ${indirectTx.length} giao dịch INDIRECT sang Chi phí gián tiếp`);
  }catch(err){
    alert('Lỗi khi chuyển dữ liệu: ' + err.message);
  }
}
document.getElementById('btn-migrate-indirect')?.addEventListener('click', migrateIndirectToFixedCosts);
