// =============================================================
// LỊCH SỬ CHỈNH SỬA (AUDIT LOG) + SAO LƯU ONEDRIVE — CHỈ ADMIN THẤY
// =============================================================

// Ghi 1 dòng lịch sử vào Firestore. Gọi hàm này ở MỌI thao tác quan trọng
// (tạo/sửa/xóa giao dịch, đổi trạng thái hóa đơn/CK, gửi/duyệt chi...).
// Không throw lỗi ra ngoài — log thất bại không được làm hỏng thao tác chính của người dùng.
async function logActivity(action, detail){
  try{
    if(!auth.currentUser) return;
    await db.collection('activityLog').add({
      action,               // 'create' | 'update' | 'delete' | 'status_invoice' | 'status_transfer' | 'approval_submit' | 'approval_decide'
      ...detail,             // {projectName, content, amount, type, note}
      userEmail: auth.currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }catch(err){
    console.error('logActivity error', err);
  }
}

const ACTION_LABELS = {
  create: '➕ Tạo giao dịch',
  update: '✎ Sửa giao dịch',
  delete: '🗑 Xóa giao dịch',
  status_invoice: '🧾 Đổi trạng thái hóa đơn',
  status_transfer: '🏦 Đổi trạng thái CK/nhận tiền',
  approval_submit: '📤 Gửi duyệt chi',
  approval_decide: '✅ Quyết định duyệt chi',
  backup: '💾 Sao lưu OneDrive',
};

let ACTIVITY_LOG = [];

function listenActivityLog(){
  db.collection('activityLog').orderBy('createdAt','desc').limit(500).onSnapshot((snap)=>{
    ACTIVITY_LOG = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    renderActivityLogTable();
  }, (err)=> console.error('activityLog listen error', err));
}

function renderActivityLogTable(){
  const table = document.getElementById('activity-log-table');
  if(!table) return;
  const daysSel = document.getElementById('log-filter-days');
  const days = daysSel ? Number(daysSel.value) : 30;
  const cutoff = Date.now() - days*86400000;

  const rows = ACTIVITY_LOG.filter(l=>{
    if(!l.createdAt || !l.createdAt.toDate) return true; // vừa ghi, chưa kịp có server timestamp -> vẫn hiện
    return l.createdAt.toDate().getTime() >= cutoff;
  });

  if(rows.length === 0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">🕘</div>Chưa có lịch sử nào trong khoảng thời gian này.</div></td></tr>`;
    return;
  }

  table.innerHTML = `<thead><tr>
    <th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Dự án</th><th>Nội dung</th><th>Số tiền</th>
  </tr></thead><tbody>${rows.map(l=>`
    <tr>
      <td>${l.createdAt && l.createdAt.toDate ? l.createdAt.toDate().toLocaleString('vi-VN') : '—'}</td>
      <td>${escapeHtml(l.userEmail||'')}</td>
      <td><span class="tag tag-gray">${ACTION_LABELS[l.action] || l.action}</span></td>
      <td>${escapeHtml(l.projectName||'—')}</td>
      <td>${escapeHtml(l.content||l.note||'—')}</td>
      <td class="num">${l.amount ? fmtVND(l.amount) : ''}</td>
    </tr>`).join('')}</tbody>`;
}

document.getElementById('log-filter-days')?.addEventListener('change', renderActivityLogTable);

// ---------------- Sao lưu Thu Chi lên OneDrive (thủ công — bấm khi cần, gợi ý mỗi tuần) ----------------
document.getElementById('btn-backup-onedrive')?.addEventListener('click', async ()=>{
  const el = document.getElementById('backup-status');
  if(typeof XLSX === 'undefined'){ toast('Chưa tải được thư viện Excel, thử lại sau'); return; }
  if(TRANSACTIONS.length === 0){ toast('Chưa có dữ liệu Thu Chi để sao lưu'); return; }
  el.innerHTML = '⏳ Đang tạo file sao lưu...';
  try{
    const data = TRANSACTIONS.slice()
      .sort((a,b)=> (a.projectName||'').localeCompare(b.projectName||'','vi') || (a.date||'').localeCompare(b.date||''))
      .map(t=> ({
        'Dự án': t.projectName||'', 'Loại': t.type==='IN'?'Thu':'Chi', 'Ngày': t.date||'', 'Mã': t.code||'',
        'Nội dung': t.content||'', 'Diễn giải': t.description||'', 'Thành tiền': t.amount||0,
        'Trạng thái hóa đơn': (t.invoiceStatus||'pending')==='issued'?'Đã xuất':'Chưa xuất',
        'Trạng thái CK/Nhận': (t.transferStatus||'pending')==='done' ? (t.type==='IN'?'Đã nhận':'Đã CK') : (t.type==='IN'?'Chưa nhận':'Chưa CK'),
        'Ghi chú': t.note||'',
      }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ThuChi');
    const wbBuf = XLSX.write(wb, {type:'array', bookType:'xlsx'});
    const blob = new Blob([wbBuf], {type:'application/octet-stream'});

    // đặt tên theo tuần trong năm để phân biệt các lần sao lưu
    const now = new Date();
    const jan1 = new Date(now.getFullYear(),0,1);
    const week = Math.ceil((((now - jan1) / 86400000) + jan1.getDay()+1) / 7);
    const fileName = `Backup_ThuChi_${now.getFullYear()}-W${String(week).padStart(2,'0')}.xlsx`;
    const file = new File([blob], fileName, {type:'application/octet-stream'});

    el.innerHTML = '⏳ Đang tải lên OneDrive... (có thể hiện popup đăng nhập Microsoft 365 lần đầu)';
    const result = await msUploadFile(file, 'Backups');
    el.innerHTML = `✅ Đã sao lưu xong lúc ${now.toLocaleString('vi-VN')} — <a href="${result.webUrl}" target="_blank">Xem file trên OneDrive</a>`;
    toast('Đã sao lưu Thu Chi lên OneDrive');
    logActivity('backup', {note: `Sao lưu ${data.length} giao dịch: ${fileName}`});
  }catch(err){
    el.innerHTML = `<span style="color:var(--red)">Lỗi sao lưu: ${escapeHtml(err.message)}</span>`;
    toast('Lỗi sao lưu: ' + err.message);
  }
});
