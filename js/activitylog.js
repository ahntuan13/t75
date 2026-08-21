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

// ---------------- Sao lưu Thu Chi lên OneDrive ----------------
// LƯU Ý QUAN TRỌNG VỀ GIỚI HẠN KỸ THUẬT: App này là web tĩnh (GitHub Pages), KHÔNG có server chạy nền,
// nên KHÔNG THỂ tự sao lưu đúng "8h tối" dù không ai mở app (cần Firebase Cloud Functions + gói trả phí
// Blaze để làm được việc đó thật sự). Giải pháp khả thi nhất trong điều kiện hiện tại: mỗi khi có AI (Admin)
// MỞ APP sau 20:00 mà HÔM NAY CHƯA sao lưu lần nào, hệ thống sẽ tự động sao lưu ngay lúc đó (không cần bấm nút).
// Nếu không ai mở app sau 20h hôm đó, ngày đó sẽ không có bản sao lưu — đây là giới hạn thực tế cần lưu ý.
async function runBackupToOneDrive(silent){
  const el = document.getElementById('backup-status');
  if(typeof XLSX === 'undefined') return false;
  const hasAnyData = TRANSACTIONS.length || (typeof FIXEDCOSTS!=='undefined' && FIXEDCOSTS.length) ||
    (typeof PROJECTS!=='undefined' && PROJECTS.length) || (typeof ORDERS!=='undefined' && ORDERS.length) ||
    (typeof EMPLOYEES!=='undefined' && EMPLOYEES.length);
  if(!hasAnyData) return false;
  if(el) el.innerHTML = '⏳ Đang tạo file sao lưu...';
  try{
    const wb = XLSX.utils.book_new();

    // 1) DÒNG TIỀN: Thu Chi (theo dự án)
    const txData = TRANSACTIONS.slice()
      .sort((a,b)=> (a.projectName||'').localeCompare(b.projectName||'','vi') || (a.date||'').localeCompare(b.date||''))
      .map(t=> ({
        'Dự án': t.projectName||'', 'Loại': t.type==='IN'?'Thu':'Chi', 'Ngày': t.date||'', 'Mã': t.code||'',
        'Nội dung': t.content||'', 'Diễn giải': t.description||'', 'Thành tiền': t.amount||0,
        'Trạng thái hóa đơn': (t.invoiceStatus||'pending')==='issued'?'Đã xuất':'Chưa xuất',
        'Số hóa đơn': t.invoiceNumber||'', 'Trạng thái CK/Nhận': (t.transferStatus||'pending')==='done' ? (t.type==='IN'?'Đã nhận':'Đã CK') : (t.type==='IN'?'Chưa nhận':'Chưa CK'),
        'Ngân hàng': t.bankName||'', 'Số TK': t.bankAccount||'', 'Trạng thái duyệt': t.approvalStatus||'', 'Ghi chú': t.note||'',
      }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txData.length?txData:[{}]), 'ThuChi');

    // 2) DÒNG TIỀN: Chi phí gián tiếp
    const fcData = (typeof FIXEDCOSTS!=='undefined'?FIXEDCOSTS:[]).slice()
      .sort((a,b)=> (a.date||'').localeCompare(b.date||''))
      .map(t=> ({
        'Loại': t.type==='IN'?'Thu':'Chi', 'Ngày': t.date||'', 'Mã': t.code||'', 'Nội dung': t.content||'',
        'Diễn giải': t.description||'', 'Thành tiền': t.amount||0, 'Trạng thái giải chi': t.advanceExplainStatus||'',
        'Ghi chú': t.note||'',
      }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fcData.length?fcData:[{}]), 'ChiPhiGianTiep');

    // 3) DỰ ÁN
    const projData = (typeof PROJECTS!=='undefined'?PROJECTS:[]).map(p=> ({
      'Tên dự án': p.name||'', 'Mã': p.code||'', 'Khách hàng': p.customer||'', 'MST': p.taxCode||'',
      'Giá trị HĐ': p.contractValue||0, 'Chi phí dự toán': p.costBudget||0, 'Doanh thu dự toán': p.revenueBudget||0,
      'Trạng thái': p.status||'', 'Ngày ký HĐ': p.signDate||'', 'Ngày hoàn thành': p.completionDate||'', 'Ghi chú': p.note||'',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projData.length?projData:[{}]), 'DuAn');

    // 4) CHI & LƯƠNG: Lệnh chi/Tạm ứng
    const ordData = (typeof ORDERS!=='undefined'?ORDERS:[]).map(o=> ({
      'Loại': o.orderType||'', 'Ngày': o.date||'', 'Người nhận': o.payee||'', 'Lý do': o.reason||'',
      'Dự án': o.projectName||'', 'Số tiền': o.amount||0, 'Trạng thái duyệt': o.approvalStatus||'',
      'Đã duyệt bởi': o.approvedBy||'', 'Giải chi': o.explanation||'',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ordData.length?ordData:[{}]), 'LenhChiTamUng');

    // 5) CHI & LƯƠNG: Nhân viên
    const empData = (typeof EMPLOYEES!=='undefined'?EMPLOYEES:[]).map(e=> ({
      'Họ tên': e.name||'', 'Chức vụ': e.position||'', 'Nhóm lương': e.payType==='daily'?'Công nhân':'Quản lý',
      'Lương HĐLĐ/BHXH': e.contractSalary||0, 'Lương hiệu quả': e.effectiveRate||0, 'Ghi chú': e.note||'',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empData.length?empData:[{}]), 'NhanVien');

    // 6) CHI & LƯƠNG: Chấm công
    const tsData = (typeof TIMESHEETS!=='undefined'?TIMESHEETS:[]).map(t=>{
      const s = t.shifts||{};
      return {
        'Nhân viên': t.employeeName||'', 'Ngày': t.date||'',
        'Sáng - Dự án': s.sang?.projectName||'', 'Sáng - Giờ': s.sang?.hours||0,
        'Chiều - Dự án': s.chieu?.projectName||'', 'Chiều - Giờ': s.chieu?.hours||0,
        'Tối - Dự án': s.toi?.projectName||'', 'Tối - Giờ (TC)': s.toi?.hours||0,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tsData.length?tsData:[{}]), 'ChamCong');

    const wbBuf = XLSX.write(wb, {type:'array', bookType:'xlsx'});
    const blob = new Blob([wbBuf], {type:'application/octet-stream'});

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const fileName = `Backup_TUAN75_${dateStr}${silent ? '_auto' : ''}.xlsx`;
    const file = new File([blob], fileName, {type:'application/octet-stream'});

    if(el) el.innerHTML = '⏳ Đang tải lên OneDrive... (có thể hiện popup đăng nhập Microsoft 365 lần đầu)';
    const result = await msUploadFile(file, 'Backups');
    const totalCount = txData.length + fcData.length + projData.length + ordData.length + empData.length + tsData.length;
    if(el) el.innerHTML = `✅ Đã sao lưu xong lúc ${now.toLocaleString('vi-VN')} (${totalCount} bản ghi, 6 nhóm dữ liệu) — <a href="${result.webUrl}" target="_blank">Xem file trên OneDrive</a>`;
    toast(silent ? '💾 Đã tự động sao lưu toàn bộ dữ liệu (sau 20h hôm nay)' : 'Đã sao lưu toàn bộ dữ liệu lên OneDrive');
    logActivity('backup', {note: `Sao lưu đầy đủ: ${txData.length} Thu Chi, ${fcData.length} Chi phí gián tiếp, ${projData.length} Dự án, ${ordData.length} Lệnh chi, ${empData.length} NV, ${tsData.length} Chấm công — ${fileName}${silent?' (tự động)':''}`});
    await db.collection('settings').doc('backupMeta').set({ lastBackupDate: dateStr, lastBackupAt: firebase.firestore.FieldValue.serverTimestamp() }, {merge:true});
    return true;
  }catch(err){
    if(el) el.innerHTML = `<span style="color:var(--red)">Lỗi sao lưu: ${escapeHtml(err.message)}</span>`;
    if(!silent) toast('Lỗi sao lưu: ' + err.message);
    console.error('backup error', err);
    return false;
  }
}

document.getElementById('btn-backup-onedrive')?.addEventListener('click', ()=> runBackupToOneDrive(false));

// Kiểm tra khi mở app: nếu đang là Admin, sau 20h, và HÔM NAY CHƯA sao lưu -> tự động sao lưu ngay (im lặng,
// không hiện hộp thoại xác nhận, chỉ có 1 toast nhỏ báo đã xong).
async function checkAutoBackup(){
  try{
    if(!isAdmin()) return;
    const now = new Date();
    if(now.getHours() < 20) return; // chưa tới 20h thì thôi, chờ lần mở app sau
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const snap = await db.collection('settings').doc('backupMeta').get();
    const lastDate = snap.exists ? snap.data().lastBackupDate : null;
    if(lastDate === dateStr) return; // hôm nay đã sao lưu rồi
    await runBackupToOneDrive(true);
  }catch(err){ console.error('checkAutoBackup error', err); }
}

// ---------------- Khôi phục Thu Chi từ file sao lưu (dùng khi lỡ mất dữ liệu) ----------------
document.getElementById('btn-restore-backup')?.addEventListener('click', ()=> document.getElementById('restore-backup-input').click());
document.getElementById('restore-backup-input')?.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  if(typeof XLSX === 'undefined'){ toast('Chưa tải được thư viện Excel'); return; }
  const el = document.getElementById('backup-status');
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array', cellDates:true});
    const asDateStr = (v)=> v instanceof Date ? v.toISOString().slice(0,10) : String(v||'');
    const readSheet = (name)=> wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], {defval:'', cellDates:true}) : [];

    // Khai báo 6 nhóm dữ liệu có thể khôi phục — mỗi nhóm biết cách đọc đúng cột trong sheet của nó
    // và map lại đúng cấu trúc field mà app đang dùng (khớp NGUYÊN VẸN với format lúc Sao lưu).
    const groups = [
      {
        key:'tx', label:'Thu Chi', sheet:'ThuChi', collection:'transactions', currentArr: TRANSACTIONS,
        map: (row)=>{
          const proj = PROJECTS.find(p=> p.name === row['Dự án']);
          return {
            projectId: proj?proj.id:'', projectName: row['Dự án']||'', type: row['Loại']==='Thu'?'IN':'OUT',
            date: asDateStr(row['Ngày']), code: row['Mã']||'', content: row['Nội dung']||'', description: row['Diễn giải']||'',
            amount: Number(row['Thành tiền'])||0,
            invoiceStatus: row['Trạng thái hóa đơn']==='Đã xuất'?'issued':'pending', invoiceNumber: row['Số hóa đơn']||'',
            transferStatus: (row['Trạng thái CK/Nhận']||'').startsWith('Đã')?'done':'pending',
            bankName: row['Ngân hàng']||'', bankAccount: row['Số TK']||'', approvalStatus: row['Trạng thái duyệt']||'',
            note: row['Ghi chú']||'', unit:'', qty:0, unitPrice:0, invoiceDate:'', bankHolder:'', transferDate:'', invoiceImage:'', transferImage:'',
          };
        },
      },
      {
        key:'fc', label:'Chi phí gián tiếp', sheet:'ChiPhiGianTiep', collection:'fixedCosts', currentArr: (typeof FIXEDCOSTS!=='undefined'?FIXEDCOSTS:[]),
        map: (row)=> ({
          type: row['Loại']==='Thu'?'IN':'OUT', date: asDateStr(row['Ngày']), code: row['Mã']||'',
          content: row['Nội dung']||'', description: row['Diễn giải']||'', amount: Number(row['Thành tiền'])||0,
          advanceExplainStatus: row['Trạng thái giải chi']||'', note: row['Ghi chú']||'',
          projectId:'', projectName:'', invoiceStatus:'pending', transferStatus:'pending',
        }),
      },
      {
        key:'proj', label:'Dự án', sheet:'DuAn', collection:'projects', currentArr: (typeof PROJECTS!=='undefined'?PROJECTS:[]),
        map: (row)=> ({
          name: row['Tên dự án']||'', code: row['Mã']||'', customer: row['Khách hàng']||'', taxCode: row['MST']||'',
          contractValue: Number(row['Giá trị HĐ'])||0, costBudget: Number(row['Chi phí dự toán'])||0, revenueBudget: Number(row['Doanh thu dự toán'])||0,
          status: row['Trạng thái']||'active', signDate: asDateStr(row['Ngày ký HĐ']), completionDate: asDateStr(row['Ngày hoàn thành']), note: row['Ghi chú']||'',
        }),
      },
      {
        key:'ord', label:'Lệnh chi/Tạm ứng', sheet:'LenhChiTamUng', collection:'paymentOrders', currentArr: (typeof ORDERS!=='undefined'?ORDERS:[]),
        map: (row)=>{
          const proj = PROJECTS.find(p=> p.name === row['Dự án']);
          return {
            orderType: row['Loại']||'payment', date: asDateStr(row['Ngày']), payee: row['Người nhận']||'', reason: row['Lý do']||'',
            projectId: proj?proj.id:'', projectName: row['Dự án']||'', amount: Number(row['Số tiền'])||0,
            approvalStatus: row['Trạng thái duyệt']||'', approvedBy: row['Đã duyệt bởi']||'', explanation: row['Giải chi']||'',
          };
        },
      },
      {
        key:'emp', label:'Nhân viên', sheet:'NhanVien', collection:'employees', currentArr: (typeof EMPLOYEES!=='undefined'?EMPLOYEES:[]),
        map: (row)=> ({
          name: row['Họ tên']||'', position: row['Chức vụ']||'', payType: row['Nhóm lương']==='Công nhân'?'daily':'monthly',
          contractSalary: Number(row['Lương HĐLĐ/BHXH'])||0, effectiveRate: Number(row['Lương hiệu quả'])||0, note: row['Ghi chú']||'',
        }),
      },
      {
        key:'ts', label:'Chấm công', sheet:'ChamCong', collection:'timesheets', currentArr: (typeof TIMESHEETS!=='undefined'?TIMESHEETS:[]),
        map: (row, ctx)=>{
          const emp = (ctx.employees||[]).find(e=> e.name === row['Nhân viên']);
          const buildShift = (projCol, hourCol)=> ({ projectId:'', projectName: row[projCol]||'', hours: Number(row[hourCol])||0 });
          return {
            employeeId: emp?emp.id:'', employeeName: row['Nhân viên']||'', date: asDateStr(row['Ngày']),
            shifts: { sang: buildShift('Sáng - Dự án','Sáng - Giờ'), chieu: buildShift('Chiều - Dự án','Chiều - Giờ'), toi: buildShift('Tối - Dự án','Tối - Giờ (TC)') },
          };
        },
      },
    ];

    // Đọc trước để biết sheet nào THỰC SỰ có dữ liệu trong file, chỉ hỏi khôi phục đúng các nhóm đó
    const available = groups.map(g=> ({...g, rows: readSheet(g.sheet).filter(r=> Object.values(r).some(v=>v!==''))}))
      .filter(g=> g.rows.length > 0);
    if(available.length === 0){ alert('File sao lưu không có dữ liệu nào (hoặc không đúng định dạng do app này tạo ra).'); return; }

    const summary = available.map(g=>`- ${g.label}: ${g.rows.length} dòng`).join('\n');
    if(!confirm(`File sao lưu có các nhóm dữ liệu sau:\n${summary}\n\n⚠️ Khôi phục sẽ XÓA TOÀN BỘ dữ liệu HIỆN TẠI của TỪNG NHÓM này và thay bằng đúng nội dung trong file. Không hoàn tác được.\n\nBấm OK để khôi phục TẤT CẢ các nhóm trên. Bấm Cancel để hủy.`)) return;
    if(!confirm('Xác nhận LẦN CUỐI: bạn chắc chắn muốn khôi phục dữ liệu từ file sao lưu này?')) return;

    if(el) el.innerHTML = '⏳ Đang khôi phục dữ liệu...';
    const CHUNK = 400;
    let totalRestored = 0;
    for(const g of available){
      // Xóa dữ liệu hiện tại của nhóm này
      const currentIds = g.currentArr.map(x=>x.id);
      for(let i=0;i<currentIds.length;i+=CHUNK){
        const batch = db.batch();
        currentIds.slice(i,i+CHUNK).forEach(id=> batch.delete(db.collection(g.collection).doc(id)));
        await batch.commit();
      }
      // Ghi lại từ file sao lưu
      const ctx = { employees: (typeof EMPLOYEES!=='undefined'?EMPLOYEES:[]) };
      for(let i=0;i<g.rows.length;i+=CHUNK){
        const batch = db.batch();
        g.rows.slice(i,i+CHUNK).forEach(row=>{
          const ref = db.collection(g.collection).doc();
          batch.set(ref, {...g.map(row, ctx), createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: auth.currentUser.email, restoredFromBackup: true});
        });
        await batch.commit();
      }
      totalRestored += g.rows.length;
      if(el) el.innerHTML = `⏳ Đã khôi phục ${g.label} (${g.rows.length} dòng)...`;
    }
    if(el) el.innerHTML = `✅ Đã khôi phục xong ${totalRestored} bản ghi trong ${available.length} nhóm dữ liệu.`;
    toast(`✅ Đã khôi phục ${totalRestored} bản ghi (${available.length} nhóm dữ liệu)`);
    logActivity('backup', {note: `Khôi phục ${totalRestored} bản ghi từ ${available.length} nhóm (${available.map(g=>g.label).join(', ')}): ${file.name}`});
  }catch(err){
    alert('Lỗi khôi phục: ' + err.message);
  }
});
