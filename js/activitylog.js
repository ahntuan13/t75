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

// =============================================================
// SAO LƯU ĐẦY ĐỦ LÊN ONEDRIVE CÔNG TY
// Mỗi lần sao lưu tạo 2 file trong thư mục Backups/ trên OneDrive:
//  - .json  : bản ĐẦY ĐỦ 100% (mọi nhóm, mọi trường, giữ nguyên ID) — dùng để KHÔI PHỤC chính xác.
//  - .xlsx  : bản để NGƯỜI đọc/đối chiếu bằng Excel (không dùng để khôi phục đầy đủ được).
// App là web tĩnh, không có server chạy nền: sao lưu tự động chạy khi Admin mở app (xem checkAutoBackup).
// =============================================================

// Các nhóm dữ liệu được sao lưu. restore:false = chỉ lưu để tra cứu, không khôi phục ngược (VD Lịch sử
// chỉnh sửa: quy tắc bảo mật không cho sửa/xóa, đúng tinh thần "nhật ký không được can thiệp").
const BACKUP_COLLECTIONS = [
  { name:'transactions',      label:'Thu chi dự án',             restore:true,  defaultOn:true },
  { name:'fixedCosts',        label:'Chi phí gián tiếp',          restore:true,  defaultOn:true },
  { name:'projects',          label:'Dự án',                      restore:true,  defaultOn:true },
  { name:'paymentOrders',     label:'Lệnh thu/chi/tạm ứng',       restore:true,  defaultOn:true },
  { name:'employees',         label:'Nhân viên',                  restore:true,  defaultOn:true },
  { name:'timesheets',        label:'Chấm công',                  restore:true,  defaultOn:true },
  { name:'payrollAdjustments',label:'Điều chỉnh lương / Tiền công',restore:true,  defaultOn:true },
  { name:'settings',          label:'Cài đặt hệ thống',           restore:true,  defaultOn:false },
  { name:'users',             label:'Người dùng & phân quyền',     restore:true,  defaultOn:false },
  { name:'activityLog',       label:'Lịch sử chỉnh sửa',          restore:false, defaultOn:false },
];
const BACKUP_FORMAT_VERSION = 1;

// Firestore Timestamp không chuyển thẳng sang JSON được — mã hóa thành {__t:'ts', s, n} và giải mã lại khi khôi phục.
function encodeFsValue(v){
  if(v === null || v === undefined) return v;
  if(v instanceof firebase.firestore.Timestamp) return { __t:'ts', s:v.seconds, n:v.nanoseconds };
  if(Array.isArray(v)) return v.map(encodeFsValue);
  if(typeof v === 'object'){ const o={}; Object.keys(v).forEach(k=> o[k]=encodeFsValue(v[k])); return o; }
  return v;
}
function decodeFsValue(v){
  if(v === null || v === undefined) return v;
  if(Array.isArray(v)) return v.map(decodeFsValue);
  if(typeof v === 'object'){
    if(v.__t === 'ts' && typeof v.s === 'number') return new firebase.firestore.Timestamp(v.s, v.n||0);
    const o={}; Object.keys(v).forEach(k=> o[k]=decodeFsValue(v[k])); return o;
  }
  return v;
}

// Đọc TRỰC TIẾP từ Firestore (không dùng dữ liệu đang nạp trên màn hình — có nhóm chỉ nạp 1 phần, VD Lịch sử 500 dòng).
async function buildFullBackupJson(onStep){
  const out = { app:'T75', formatVersion: BACKUP_FORMAT_VERSION, createdAt: new Date().toISOString(),
    createdBy: auth.currentUser ? auth.currentUser.email : '', counts:{}, collections:{} };
  for(const c of BACKUP_COLLECTIONS){
    if(onStep) onStep(c.label);
    const snap = await db.collection(c.name).get();
    out.collections[c.name] = snap.docs.map(d=> ({ id: d.id, data: encodeFsValue(d.data()) }));
    out.counts[c.name] = snap.size;
  }
  return out;
}

function backupStamp(){
  const now = new Date();
  const p = (n)=> String(n).padStart(2,'0');
  return { date:`${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())}`, time:`${p(now.getHours())}${p(now.getMinutes())}`, now };
}

// File Excel để người xem đọc (giữ như trước — không dùng để khôi phục đầy đủ).
function buildReadableExcelBlob(){
  if(typeof XLSX === 'undefined') return null;
  const wb = XLSX.utils.book_new();
  const add = (rows, name)=> XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{}]), name);
  add(TRANSACTIONS.map(t=>({'Dự án':t.projectName||'','Loại':t.type==='IN'?'Thu':'Chi','Ngày':t.date||'','Mã':t.code||'','Nội dung':t.content||'','Diễn giải':t.description||'','Thành tiền':t.amount||0,'Hóa đơn':(t.invoiceStatus||'pending')==='issued'?'Đã xuất':'Chưa xuất','CK/Nhận':(t.transferStatus||'pending')==='done'?'Đã':'Chưa','Duyệt':t.approvalStatus||'','Ghi chú':t.note||''})), 'ThuChi');
  add((typeof FIXEDCOSTS!=='undefined'?FIXEDCOSTS:[]).map(t=>({'Loại':t.type==='IN'?'Thu':'Chi','Ngày':t.date||'','Mã':t.code||'','Nội dung':t.content||'','Diễn giải':t.description||'','Thành tiền':t.amount||0,'Giải chi':t.advanceExplainStatus||'','Ghi chú':t.note||''})), 'ChiPhiGianTiep');
  add((typeof PROJECTS!=='undefined'?PROJECTS:[]).map(p=>({'Tên dự án':p.name||'','Mã':p.code||'','Khách hàng':p.customer||'','Giá trị HĐ':p.contractValue||0,'Chi phí dự toán':p.costBudget||0,'Doanh thu dự toán':p.revenueBudget||0,'Trạng thái':p.status||''})), 'DuAn');
  add((typeof ORDERS!=='undefined'?ORDERS:[]).map(o=>({'Loại':o.orderType||'','Ngày':o.date||'','Người nhận':o.payee||'','Lý do':o.reason||'','Dự án':o.projectName||'','Số tiền':o.amount||0,'Duyệt':o.approvalStatus||''})), 'LenhThuChi');
  add((typeof EMPLOYEES!=='undefined'?EMPLOYEES:[]).map(e=>({'Họ tên':e.name||'','Chức vụ':e.position||'','Nhóm lương':e.payType==='daily'?'Công nhân':'Quản lý','Lương HĐLĐ':e.contractSalary||0,'Lương hiệu quả':e.effectiveRate||0})), 'NhanVien');
  const buf = XLSX.write(wb, {type:'array', bookType:'xlsx'});
  return new Blob([buf], {type:'application/octet-stream'});
}

let backupRunning = false;
async function runBackupToOneDrive(silent){
  if(backupRunning) return false;
  const el = document.getElementById('backup-status');
  if(!isAdmin()){ if(!silent) toast('Chỉ Admin được sao lưu toàn bộ dữ liệu.'); return false; }
  backupRunning = true;
  const btn = document.getElementById('btn-backup-onedrive');
  if(btn) btn.disabled = true;
  try{
    const { date, time, now } = backupStamp();
    const suffix = silent ? '_auto' : '';
    if(el) el.innerHTML = '⏳ Đang đọc toàn bộ dữ liệu...';
    const backup = await buildFullBackupJson((label)=>{ if(el) el.innerHTML = `⏳ Đang đọc: ${escapeHtml(label)}...`; });
    const total = Object.values(backup.counts).reduce((s,n)=>s+n,0);

    // 1) File JSON đầy đủ — quan trọng nhất, phải thành công thì mới tính là đã sao lưu.
    const jsonName = `Backup_TUAN75_${date}_${time}${suffix}.json`;
    const jsonFile = new File([JSON.stringify(backup)], jsonName, {type:'application/json'});
    if(el) el.innerHTML = '⏳ Đang tải bản sao lưu đầy đủ lên OneDrive...';
    const jsonResult = await msUploadFile(jsonFile, 'Backups', (pct)=>{ if(el) el.innerHTML = `⏳ Đang tải lên OneDrive... ${pct}%`; });

    // 2) File Excel để đọc — lỗi thì bỏ qua, không làm hỏng bản sao lưu chính.
    let xlsxResult = null;
    try{
      const xblob = buildReadableExcelBlob();
      if(xblob) xlsxResult = await msUploadFile(new File([xblob], `Backup_TUAN75_${date}_${time}${suffix}.xlsx`, {type:'application/octet-stream'}), 'Backups');
    }catch(xerr){ console.warn('Excel backup skipped', xerr); }

    await db.collection('settings').doc('backupMeta').set({
      lastBackupDate: date, lastBackupAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastBackupFile: jsonName, lastBackupUrl: jsonResult.webUrl, lastBackupTotal: total,
    }, {merge:true});

    if(el) el.innerHTML = `✅ Đã sao lưu lúc ${now.toLocaleString('vi-VN')} — ${total} bản ghi, ${BACKUP_COLLECTIONS.length} nhóm dữ liệu. `
      + `<a href="${jsonResult.webUrl}" target="_blank" rel="noopener">📎 Bản đầy đủ (.json)</a>`
      + (xlsxResult ? ` · <a href="${xlsxResult.webUrl}" target="_blank" rel="noopener">📎 Bản Excel</a>` : '');
    toast(silent ? '💾 Đã tự động sao lưu toàn bộ dữ liệu lên OneDrive' : '✅ Đã sao lưu toàn bộ dữ liệu lên OneDrive');
    logActivity('backup', {note: `Sao lưu đầy đủ ${total} bản ghi — ${jsonName}${silent?' (tự động)':''}`});
    renderBackupWarning(new Date());
    return true;
  }catch(err){
    const msg = (typeof friendlyMsError==='function') ? friendlyMsError(err) : err.message;
    if(el) el.innerHTML = `<span style="color:var(--red)">Lỗi sao lưu: ${escapeHtml(msg)}</span>`;
    if(!silent) toast('Lỗi sao lưu: ' + msg);
    console.error('backup error', err);
    return false;
  }finally{
    backupRunning = false;
    if(btn) btn.disabled = false;
  }
}
document.getElementById('btn-backup-onedrive')?.addEventListener('click', ()=> runBackupToOneDrive(false));

// Banner nhắc Admin khi đã quá 2 ngày chưa có bản sao lưu nào (hoặc chưa sao lưu lần nào).
function renderBackupWarning(lastAt){
  const box = document.getElementById('backup-warning-banner');
  if(!box) return;
  const STALE_MS = 2*24*60*60*1000;
  if(!isAdmin() || (lastAt && (Date.now() - lastAt.getTime()) < STALE_MS)){ box.style.display='none'; box.innerHTML=''; return; }
  const label = lastAt ? `Lần sao lưu gần nhất: <strong>${lastAt.toLocaleString('vi-VN')}</strong> (đã quá 2 ngày).` : 'Hệ thống <strong>chưa có bản sao lưu nào</strong>.';
  box.className = 'approval-banner';
  box.style.display = 'flex'; box.style.alignItems = 'center'; box.style.justifyContent = 'space-between'; box.style.gap = '12px';
  box.innerHTML = `<div>💾 ${label} Nên sao lưu ngay để có thể khôi phục khi app gặp sự cố.</div>
    <div style="flex:none;"><button class="btn btn-primary btn-sm" id="backup-warning-run">Sao lưu ngay</button></div>`;
  document.getElementById('backup-warning-run')?.addEventListener('click', async ()=>{
    if(typeof msIsLoggedIn==='function' && !msIsLoggedIn()){ toast('Bấm "🔗 Kết nối OneDrive" ở cuối menu bên trái trước, rồi bấm Sao lưu lại.'); return; }
    await runBackupToOneDrive(false);
  });
}

// Chạy 1 lần khi mở app (Admin): tự sao lưu nếu hôm nay chưa có bản nào VÀ (đã sau 20h, HOẶC đã bỏ lỡ từ hôm
// qua trở về trước — bù ngay khi mở app, không chờ tới 20h). Chỉ chạy khi ĐÃ kết nối OneDrive: không tự mở
// popup đăng nhập ngầm (trình duyệt sẽ chặn và có thể làm kẹt đăng nhập Microsoft).
async function checkAutoBackup(){
  try{
    if(!isAdmin()) return;
    const snap = await db.collection('settings').doc('backupMeta').get();
    const meta = snap.exists ? snap.data() : {};
    const lastAt = meta.lastBackupAt && meta.lastBackupAt.toDate ? meta.lastBackupAt.toDate() : null;
    renderBackupWarning(lastAt);
    if(typeof msIsLoggedIn === 'function' && !msIsLoggedIn()) return;
    const { date, now } = backupStamp();
    if(meta.lastBackupDate === date) return; // hôm nay đã có bản sao lưu
    const missedDays = !lastAt || (now - lastAt) > 24*60*60*1000;
    if(now.getHours() >= 20 || missedDays) await runBackupToOneDrive(true);
  }catch(err){ console.error('checkAutoBackup error', err); }
}

// =============================================================
// KHÔI PHỤC TỪ BẢN SAO LƯU ĐẦY ĐỦ (.json)
// Ghi lại đúng từng bản ghi với ĐÚNG ID cũ (giữ nguyên liên kết Lệnh chi ↔ Thu chi, Giải chi ↔ lệnh gốc...),
// và xóa các bản ghi phát sinh sau thời điểm sao lưu — đưa nhóm dữ liệu được chọn về đúng trạng thái lúc đó.
// =============================================================
let pendingRestoreBackup = null;
function ensureRestoreModal(){
  if(document.getElementById('modal-restore-json')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="modal-restore-json">
      <div class="modal" style="max-width:720px;width:100%;">
        <div class="modal-head"><h3>📥 Khôi phục từ bản sao lưu</h3><button class="modal-close" data-close>✕</button></div>
        <div class="modal-body">
          <div id="restore-json-summary" class="tx-view-note" style="margin-bottom:12px;"></div>
          <div class="table-wrap"><table class="data" id="restore-json-table"></table></div>
          <p class="helper-text" style="margin-top:12px;">Trước khi khôi phục, hệ thống <strong>tự tải về máy 1 bản sao lưu của dữ liệu hiện tại</strong> (và tải lên OneDrive nếu đã kết nối) — lỡ chọn nhầm vẫn quay lại được.</p>
          <div class="field" style="margin-top:10px;"><label>Gõ <strong>KHOI PHUC</strong> để xác nhận</label><input id="restore-json-confirm" placeholder="KHOI PHUC" autocomplete="off"></div>
        </div>
        <div class="modal-foot"><button class="btn btn-ghost" data-close>Hủy</button><button class="btn btn-danger" id="restore-json-run">Khôi phục các nhóm đã chọn</button></div>
      </div>
    </div>`);
  document.getElementById('restore-json-run').addEventListener('click', runJsonRestore);
}

async function openJsonRestore(file){
  if(!isAdmin()){ toast('Chỉ Admin được khôi phục dữ liệu.'); return; }
  let backup;
  try{ backup = JSON.parse(await file.text()); }catch(e){ alert('File không đọc được — không phải file sao lưu .json hợp lệ.'); return; }
  if(!backup || backup.app !== 'T75' || !backup.collections){ alert('File này không phải bản sao lưu của app T75.'); return; }
  pendingRestoreBackup = backup;
  ensureRestoreModal();
  const created = backup.createdAt ? new Date(backup.createdAt).toLocaleString('vi-VN') : '—';
  document.getElementById('restore-json-summary').innerHTML =
    `<strong>${escapeHtml(file.name)}</strong><br>Tạo lúc: <strong>${created}</strong> · bởi ${escapeHtml(backup.createdBy||'—')}<br>`
    + `<span style="color:var(--red);">Nhóm được chọn sẽ quay về ĐÚNG trạng thái lúc sao lưu — mọi thay đổi sau thời điểm đó của nhóm đó sẽ mất.</span>`;
  const table = document.getElementById('restore-json-table');
  table.innerHTML = '<tr><td class="helper-text">⏳ Đang đếm dữ liệu hiện tại...</td></tr>';
  document.getElementById('restore-json-confirm').value = '';
  openModal('modal-restore-json');
  const rows = [];
  for(const c of BACKUP_COLLECTIONS){
    if(!c.restore || !Array.isArray(backup.collections[c.name])) continue;
    let current = '—';
    try{ current = (await db.collection(c.name).get()).size; }catch(e){}
    rows.push(`<tr>
      <td><input type="checkbox" class="restore-json-cb" data-col="${c.name}" ${c.defaultOn ? 'checked' : ''}></td>
      <td>${escapeHtml(c.label)}${c.defaultOn ? '' : ' <span class="helper-text">(chỉ chọn khi thật cần)</span>'}</td>
      <td class="num">${backup.collections[c.name].length}</td>
      <td class="num">${current}</td>
    </tr>`);
  }
  table.innerHTML = `<thead><tr><th></th><th>Nhóm dữ liệu</th><th>Trong bản sao lưu</th><th>Hiện tại</th></tr></thead><tbody>${rows.join('')}</tbody>`;
}

function downloadJsonLocally(obj, name){
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj)], {type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 5000);
}

async function runJsonRestore(){
  const backup = pendingRestoreBackup;
  if(!backup) return;
  if(document.getElementById('restore-json-confirm').value.trim().toUpperCase() !== 'KHOI PHUC'){ toast('Gõ đúng "KHOI PHUC" để xác nhận.'); return; }
  const cols = Array.from(document.querySelectorAll('.restore-json-cb:checked')).map(cb=> cb.dataset.col);
  if(!cols.length){ toast('Chưa chọn nhóm dữ liệu nào.'); return; }
  const btn = document.getElementById('restore-json-run');
  const el = document.getElementById('backup-status');
  btn.disabled = true;
  try{
    // 1) Bản sao lưu an toàn của dữ liệu HIỆN TẠI — luôn tải về máy; tải thêm lên OneDrive nếu đã kết nối.
    btn.textContent = '⏳ Đang sao lưu dữ liệu hiện tại...';
    const safety = await buildFullBackupJson();
    const { date, time } = backupStamp();
    const safetyName = `Backup_TUAN75_${date}_${time}_TRUOC-KHOI-PHUC.json`;
    downloadJsonLocally(safety, safetyName);
    if(typeof msIsLoggedIn==='function' && msIsLoggedIn()){
      try{ await msUploadFile(new File([JSON.stringify(safety)], safetyName, {type:'application/json'}), 'Backups'); }catch(e){ console.warn('safety upload failed', e); }
    }

    // 2) Khôi phục từng nhóm: ghi đè đúng ID cũ, xóa bản ghi không có trong bản sao lưu.
    const myUid = auth.currentUser ? auth.currentUser.uid : '';
    let written = 0, removed = 0;
    for(const col of cols){
      const label = (BACKUP_COLLECTIONS.find(c=>c.name===col)||{}).label || col;
      btn.textContent = `⏳ Đang khôi phục: ${label}...`;
      const items = backup.collections[col] || [];
      const keepIds = new Set(items.map(it=> it.id));
      const currentSnap = await db.collection(col).get();
      const ops = [];
      currentSnap.docs.forEach(d=>{
        if(keepIds.has(d.id)) return;
        if(col === 'users' && d.id === myUid) return; // không bao giờ tự xóa quyền của chính người đang khôi phục
        ops.push({ type:'delete', ref: db.collection(col).doc(d.id) });
      });
      items.forEach(it=> ops.push({ type:'set', ref: db.collection(col).doc(it.id), data: decodeFsValue(it.data) }));
      for(let i=0;i<ops.length;i+=400){
        const batch = db.batch();
        ops.slice(i,i+400).forEach(op=>{
          if(op.type==='delete'){ batch.delete(op.ref); removed++; }
          else { batch.set(op.ref, op.data); written++; }
        });
        await batch.commit();
      }
    }
    closeModal('modal-restore-json');
    const msg = `✅ Đã khôi phục ${cols.length} nhóm dữ liệu (${written} bản ghi, dọn ${removed} bản ghi phát sinh sau thời điểm sao lưu).`;
    if(el) el.innerHTML = msg;
    toast(msg);
    logActivity('backup', {note: `Khôi phục từ bản sao lưu ${backup.createdAt||''}: ${cols.join(', ')} — ${written} bản ghi. Bản an toàn: ${safetyName}`});
  }catch(err){
    alert('Lỗi khi khôi phục: ' + err.message + '\n\nBản sao lưu dữ liệu trước khi khôi phục đã được tải về máy — dùng file đó để khôi phục lại nếu cần.');
  }finally{
    btn.disabled = false; btn.textContent = 'Khôi phục các nhóm đã chọn';
    pendingRestoreBackup = null;
  }
}

// ---------------- Khôi phục Thu Chi từ file sao lưu (dùng khi lỡ mất dữ liệu) ----------------
document.getElementById('btn-restore-backup')?.addEventListener('click', ()=> document.getElementById('restore-backup-input').click());
document.getElementById('restore-backup-input')?.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  if(/\.json$/i.test(file.name)){ openJsonRestore(file); return; } // bản sao lưu ĐẦY ĐỦ (khuyên dùng)
  // Bên dưới: khôi phục từ file Excel kiểu CŨ (không đầy đủ, tạo ID mới — chỉ dùng khi không có file .json).
  if(!confirm('Đây là file Excel kiểu CŨ: khôi phục sẽ KHÔNG đầy đủ (mất Giải chi, file đính kèm, liên kết giữa Lệnh chi và Thu chi...).\n\nNên dùng file .json cùng ngày trong thư mục Backups/. Vẫn tiếp tục với file Excel?')) return;
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
