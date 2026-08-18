// =============================================================
// LƯƠNG & CHẤM CÔNG — dựng lại theo đúng cấu trúc file Excel gốc công ty
// (Cham_Cong.xlsx, Luong.xlsx, phiếu_lương.xlsx đã đối chiếu số liệu thật)
//
// CÔNG THỨC LƯƠNG (đã xác minh khớp 100% với dữ liệu Excel gốc):
// - Nhóm "Quản lý" (payType=monthly): Tổng thu nhập = Lương HĐLĐ + Lương hiệu quả
//   (CỐ ĐỊNH, không phụ thuộc số giờ làm thực tế trong tháng).
// - Nhóm "Công nhân" (payType=daily): Tổng thu nhập = (Tổng giờ công / 8) * Lương hiệu quả (VNĐ/ngày).
// - Khấu trừ BHXH mặc định = Lương HĐLĐ * 10.5% (có thể điều chỉnh tay riêng từng tháng).
// - Thực nhận = Tổng thu nhập − BHXH − Tạm ứng cuối tháng − Tiền ứng Mr.Tuấn
//               − Thưởng chuyên cần/điều chỉnh khác − Khấu trừ tạm ứng khác − Khấu trừ ngày nghỉ
//   (LƯU Ý: cột "Thưởng chuyên cần" trong file gốc thực chất được TRỪ đi chứ không cộng —
//   đã đối chiếu 2 dòng dữ liệu độc lập trong Luong.xlsx, khớp chính xác theo cách trừ).
//
// CHẤM CÔNG: 3 ca Sáng/Chiều/Tối mỗi ngày, mỗi ca chọn 1 dự án + số giờ.
// Ca Tối (sau 17:01) luôn được tính là GIỜ TĂNG CA. Giờ thường = Sáng + Chiều.
// =============================================================

let EMPLOYEES = [];
let TIMESHEETS = [];
let PAYROLL_ADJUSTMENTS = []; // {id, employeeId, month, bhxhOverride, tamUngCuoiThang, tienUngMrTuan, thuongChuyenCan, khauTruTamUngKhac, khauTruNgayNghi, note}

function listenPayroll(){
  db.collection('employees').orderBy('createdAt','asc').onSnapshot((snap)=>{
    EMPLOYEES = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    fillEmployeeSelects();
    renderEmployeesTable();
    renderPayrollSummary();
  }, (err)=> console.error('employees listen error', err));

  db.collection('timesheets').orderBy('date','desc').onSnapshot((snap)=>{
    TIMESHEETS = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    renderTimesheetTable();
    renderTimesheetSummary();
    renderPayrollSummary();
  }, (err)=> console.error('timesheets listen error', err));

  db.collection('payrollAdjustments').onSnapshot((snap)=>{
    PAYROLL_ADJUSTMENTS = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    renderPayrollSummary();
  }, (err)=> console.error('payrollAdjustments listen error', err));
}

function fillEmployeeSelects(){
  const node = document.getElementById('ts-filter-employee');
  if(node){
    const cur = node.value;
    node.innerHTML = '<option value="">Tất cả nhân viên</option>' + EMPLOYEES.map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
    if(cur) node.value = cur;
  }
  const empSel = document.getElementById('ts-employee');
  if(empSel){
    const cur = empSel.value;
    empSel.innerHTML = '<option value="">— Chọn nhân viên —</option>' + EMPLOYEES.map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
    if(cur) empSel.value = cur;
  }
  // dropdown dự án cho 3 ca chấm công
  ['ts-sang-project','ts-chieu-project','ts-toi-project'].forEach(id=>{
    const sel = document.getElementById(id);
    if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Không có —</option>' + PROJECTS.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    if(cur) sel.value = cur;
  });
}

// ---------------- NHÂN VIÊN ----------------
function openEmployeeModal(id){
  document.getElementById('emp-modal-title').textContent = id ? 'Sửa nhân viên' : 'Thêm nhân viên';
  document.getElementById('emp-id').value = id || '';
  const e = id ? EMPLOYEES.find(x=>x.id===id) : {};
  document.getElementById('emp-name').value = e.name || '';
  document.getElementById('emp-position').value = e.position || '';
  document.getElementById('emp-paytype').value = e.payType || 'monthly';
  setMoneyInputValue(document.getElementById('emp-contract-salary'), e.contractSalary);
  setMoneyInputValue(document.getElementById('emp-effective-rate'), e.effectiveRate);
  document.getElementById('emp-note').value = e.note || '';
  updateEmployeeEffectiveLabel();
  openModal('modal-employee');
}
function updateEmployeeEffectiveLabel(){
  const isDaily = document.getElementById('emp-paytype').value === 'daily';
  document.getElementById('emp-effective-label').textContent = isDaily ? 'Lương hiệu quả (VNĐ/ngày)' : 'Lương hiệu quả (VNĐ/tháng)';
}
document.getElementById('emp-paytype')?.addEventListener('change', updateEmployeeEffectiveLabel);
document.getElementById('btn-add-employee')?.addEventListener('click', ()=> openEmployeeModal(null));

document.getElementById('save-emp-btn').addEventListener('click', async ()=>{
  const id = document.getElementById('emp-id').value;
  const name = document.getElementById('emp-name').value.trim();
  if(!name){ toast('Vui lòng nhập họ tên'); return; }
  const data = {
    name,
    position: document.getElementById('emp-position').value.trim(),
    payType: document.getElementById('emp-paytype').value,
    contractSalary: parseMoneyInput(document.getElementById('emp-contract-salary')),
    effectiveRate: parseMoneyInput(document.getElementById('emp-effective-rate')),
    note: document.getElementById('emp-note').value.trim(),
  };
  try{
    if(id){
      await db.collection('employees').doc(id).update(data);
      toast('Đã cập nhật nhân viên');
      logActivity('update', {projectName:'Nhân viên', content: data.name, type:'OUT'});
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('employees').add(data);
      toast('Đã thêm nhân viên');
      logActivity('create', {projectName:'Nhân viên', content: data.name, type:'OUT'});
    }
    closeModal('modal-employee');
  }catch(err){ toast('Lỗi: '+err.message); }
});

function renderEmployeesTable(){
  const table = document.getElementById('employees-table');
  if(!table) return;
  if(EMPLOYEES.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">👥</div>Chưa có nhân viên nào. Bấm "+ Tạo mới" hoặc Upload Excel để thêm.</div></td></tr>`;
    return;
  }
  table.innerHTML = `<thead><tr>
    <th>Họ tên</th><th>Chức vụ</th><th>Nhóm lương</th><th>Lương HĐLĐ/BHXH</th><th>Lương hiệu quả</th><th></th>
  </tr></thead><tbody>${EMPLOYEES.map(e=>`
    <tr>
      <td><strong>${escapeHtml(e.name)}</strong></td>
      <td>${escapeHtml(e.position||'—')}</td>
      <td>${e.payType==='daily' ? '<span class="tag tag-gold">Công nhân</span>' : '<span class="tag tag-blue">Quản lý</span>'}</td>
      <td class="num">${fmtVND(e.contractSalary)}</td>
      <td class="num">${fmtVND(e.effectiveRate)}${e.payType==='daily'?'/ngày':'/tháng'}</td>
      <td>
        <div class="row-actions">
          ${!isSubAdmin() ? `<button class="icon-btn" data-edit-emp="${e.id}" title="Sửa">✎</button>` : ''}
          ${isAdmin() ? `<button class="icon-btn" data-del-emp="${e.id}" title="Xóa">🗑</button>` : ''}
        </div>
      </td>
    </tr>`).join('')}</tbody>`;
}
document.getElementById('employees-table')?.addEventListener('click', (e)=>{
  const editId = e.target.closest('[data-edit-emp]')?.dataset.editEmp;
  const delId = e.target.closest('[data-del-emp]')?.dataset.delEmp;
  if(editId) openEmployeeModal(editId);
  if(delId && confirmDelete('Xóa nhân viên này? Dữ liệu chấm công cũ vẫn được giữ lại.')){
    const emp = EMPLOYEES.find(x=>x.id===delId);
    db.collection('employees').doc(delId).delete().then(()=>{
      toast('Đã xóa nhân viên');
      if(emp) logActivity('delete', {projectName:'Nhân viên', content: emp.name, type:'OUT'});
    });
  }
});

// ---------------- Upload danh sách nhân viên (Excel) ----------------
document.getElementById('btn-upload-employees')?.addEventListener('click', ()=> document.getElementById('upload-employees-input').click());
document.getElementById('upload-employees-input')?.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  if(typeof XLSX === 'undefined'){ toast('Chưa tải được thư viện Excel'); return; }
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    // Đọc dạng MẢNG THÔ (không dùng header dòng 1) vì file lương gốc có nhiều dòng tiêu đề gộp ô
    // phía trên, và nhóm "QUẢN LÝ"/"CÔNG NHÂN" là 1 DÒNG PHÂN CÁCH chứ không phải 1 cột riêng.
    const rows = XLSX.utils.sheet_to_json(sheet, {header:1, defval:'', raw:true});
    if(rows.length===0){ alert('Không đọc được dòng dữ liệu nào.'); return; }

    // Cột: B(1)=STT, C(2)=Tên, D(3)=Chức vụ, E(4)=Lương HĐLĐ/BHXH, F(5)=Lương hiệu quả
    let currentGroup = 'monthly'; // mặc định Quản lý cho tới khi gặp dòng "CÔNG NHÂN"
    const existingNames = new Set(EMPLOYEES.map(x=>x.name.trim().toLowerCase()));
    const toAdd = [];
    for(const row of rows){
      const c = row[2], d = row[3];
      const cText = String(c||'').trim();
      if(cText === 'QUẢN LÝ'){ currentGroup = 'monthly'; continue; }
      if(cText === 'CÔNG NHÂN'){ currentGroup = 'daily'; continue; }
      // Dòng nhân viên hợp lệ: có STT là số ở cột B, Tên ở cột C, và Chức vụ ở cột D PHẢI LÀ CHỮ
      // (bảng phân bổ dự án phía cuối file cũng có số ở cột B nhưng cột D lại là số tiền -> tự loại bỏ đúng chỗ này)
      const stt = row[1];
      if(typeof stt !== 'number' || !cText || typeof d !== 'string' || !d.trim()) continue;
      if(existingNames.has(cText.toLowerCase())) continue;
      toAdd.push({
        name: cText,
        position: d.trim(),
        contractSalary: toNumber(row[4]),
        effectiveRate: toNumber(row[5]),
        payType: currentGroup,
      });
      existingNames.add(cText.toLowerCase());
    }
    if(toAdd.length===0){ alert('Không tìm thấy nhân viên mới nào để thêm (có thể đã tồn tại sẵn, hoặc file không đúng định dạng Bảng lương gốc của công ty).'); return; }
    if(!confirm(`Đọc được ${toAdd.length} nhân viên mới (${toAdd.filter(x=>x.payType==='monthly').length} Quản lý + ${toAdd.filter(x=>x.payType==='daily').length} Công nhân). Thêm vào danh sách?`)) return;

    const batch = db.batch();
    toAdd.forEach(emp=>{
      const ref = db.collection('employees').doc();
      batch.set(ref, {...emp, note:'', createdAt: firebase.firestore.FieldValue.serverTimestamp()});
    });
    await batch.commit();
    toast(`Đã thêm ${toAdd.length} nhân viên mới`);
  }catch(err){ alert('Lỗi đọc file: ' + err.message); }
});

// ---------------- Upload bảng chấm công (Excel) — đọc đúng mẫu file gốc công ty ----------------
// Mẫu file: dòng ngày (VD dòng 3) mỗi ngày chiếm 3 cột SÁNG/CHIỀU/TỐI liên tiếp; dòng dưới đó là
// tiêu đề phụ "SÁNG/CHIỀU/TỐI" lặp lại; từ đó trở xuống mỗi nhân viên chiếm 2 dòng (dòng Dự án +
// dòng Số giờ), có thể cách nhau 1 dòng trống. File KHÔNG có tên nhân viên — vì vậy áp dụng ĐÚNG
// THEO THỨ TỰ đang có trong danh sách Bảng lương (dòng 1 của file ↔ nhân viên đầu tiên, ...).
document.getElementById('btn-upload-timesheet')?.addEventListener('click', ()=> document.getElementById('upload-timesheet-input').click());
document.getElementById('upload-timesheet-input')?.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  if(typeof XLSX === 'undefined'){ toast('Chưa tải được thư viện Excel'); return; }
  if(EMPLOYEES.length === 0){ alert('Chưa có nhân viên nào trong Bảng lương — vui lòng thêm/nhập nhân viên trước.'); return; }
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array', cellDates:true});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true, defval:null});

    // 1) Tìm dòng tiêu đề phụ "SÁNG/CHIỀU/TỐI" lặp lại nhiều lần -> xác định vị trí cột từng ca
    let subheaderRowIdx = -1;
    for(let r=0; r<Math.min(rows.length, 15); r++){
      const count = (rows[r]||[]).filter(v=> v==='SÁNG').length;
      if(count >= 2){ subheaderRowIdx = r; break; }
    }
    if(subheaderRowIdx === -1){ alert('Không tìm thấy dòng tiêu đề "SÁNG/CHIỀU/TỐI" — file có đúng định dạng bảng chấm công gốc không?'); return; }
    const dateRowIdx = subheaderRowIdx - 3; // dòng ngày nằm 3 dòng phía trên (đúng theo mẫu công ty)
    const dateRow = rows[dateRowIdx] || [];

    // 2) Xác định các cột bắt đầu mỗi ngày (mỗi ngày = 3 cột SÁNG/CHIỀU/TỐI liên tiếp)
    // Chỉ lấy đúng các ngày CÙNG THÁNG với ngày đầu tiên tìm thấy — 1 số file mẫu có dư 1 cột
    // "mùng 1 tháng sau" ở cuối, không thuộc về tháng đang chấm công.
    const dayCols = []; // [{col, date}]
    let targetMonth = null, targetYear = null;
    for(let c=0; c<dateRow.length; c++){
      const v = dateRow[c];
      if(v instanceof Date && !isNaN(v)){
        if(targetMonth === null){ targetMonth = v.getMonth(); targetYear = v.getFullYear(); }
        if(v.getMonth() === targetMonth && v.getFullYear() === targetYear){
          dayCols.push({col:c, date: v});
        }
      }
    }
    if(dayCols.length === 0){ alert('Không tìm thấy cột ngày nào trong file.'); return; }

    // 3) Quét từ sau dòng tiêu đề phụ, gom các "dòng Dự án" hợp lệ (cột B hoặc E là số) theo ĐÚNG THỨ TỰ xuất hiện
    const employeeRows = []; // [{projectRow, hoursRow}]
    let r = subheaderRowIdx + 2;
    let lastFound = r;
    while(r < rows.length && r - lastFound < 6){
      const row = rows[r] || [];
      const isProjectRow = typeof row[1]==='number' || typeof row[4]==='number';
      if(isProjectRow){
        // dòng Số giờ là dòng NGAY SAU (có thể cách 0 dòng), tìm dòng gần nhất phía dưới không phải "dòng Dự án" tiếp theo
        const hoursRow = rows[r+1] || [];
        employeeRows.push({projectRow: row, hoursRow});
        lastFound = r;
        r += 2;
      } else {
        r += 1;
      }
    }
    if(employeeRows.length === 0){ alert('Không đọc được dòng chấm công nào.'); return; }

    const month = dayCols[0].date.getMonth()+1;
    const year = dayCols[0].date.getFullYear();
    const monthKeyStr = `${year}-${String(month).padStart(2,'0')}`;
    const n = Math.min(employeeRows.length, EMPLOYEES.length);
    const skipped = employeeRows.length - n;

    if(!confirm(`Đọc được chấm công tháng ${month}/${year} cho ${employeeRows.length} dòng nhân viên trong file.\n`+
      `Sẽ áp dụng theo ĐÚNG THỨ TỰ hiện có trong Bảng lương (${EMPLOYEES.length} nhân viên) — dòng 1 = "${EMPLOYEES[0]?.name}", ...\n`+
      (skipped>0 ? `⚠️ ${skipped} dòng cuối trong file sẽ bị bỏ qua vì Bảng lương không đủ nhân viên tương ứng.\n` : '')+
      `Dữ liệu chấm công cũ (nếu có) của tháng ${monthKeyStr} cho các nhân viên này sẽ bị GHI ĐÈ. Tiếp tục?`)) return;

    const CHUNK = 400;
    let opCount = 0;
    let batch = db.batch();
    for(let i=0; i<n; i++){
      const emp = EMPLOYEES[i];
      const {projectRow, hoursRow} = employeeRows[i];
      for(const {col, date} of dayCols){
        const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
        const buildShift = (offset)=>{
          const projectName = projectRow[col+offset];
          const hours = hoursRow[col+offset];
          if(!projectName && !hours) return {projectId:'', projectName:'', hours:0};
          const proj = PROJECTS.find(p=> p.name === projectName);
          return { projectId: proj ? proj.id : '', projectName: projectName || '', hours: Number(hours)||0 };
        };
        const shifts = { sang: buildShift(0), chieu: buildShift(1), toi: buildShift(2) };
        if(!shifts.sang.hours && !shifts.chieu.hours && !shifts.toi.hours) continue; // ngày không có công -> bỏ qua, không tạo dòng rỗng
        const docId = `${emp.id}_${dateStr}`;
        batch.set(db.collection('timesheets').doc(docId), {
          employeeId: emp.id, employeeName: emp.name, date: dateStr, shifts,
          note: 'Nhập từ Excel', importedFromExcel: true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: auth.currentUser.email,
        });
        opCount++;
        if(opCount >= CHUNK){ await batch.commit(); batch = db.batch(); opCount = 0; }
      }
    }
    if(opCount > 0) await batch.commit();
    toast(`✅ Đã nhập chấm công tháng ${monthKeyStr} cho ${n} nhân viên`);
  }catch(err){ alert('Lỗi đọc file: ' + err.message); }
});

// ---------------- CHẤM CÔNG (3 ca) ----------------
function openTimesheetModal(){
  if(EMPLOYEES.length===0){ toast('Vui lòng thêm nhân viên trước'); return; }
  document.getElementById('ts-id').value = '';
  document.getElementById('ts-employee').value = '';
  document.getElementById('ts-date').value = todayISO();
  ['sang','chieu','toi'].forEach(shift=>{
    document.getElementById(`ts-${shift}-project`).value = '';
    document.getElementById(`ts-${shift}-hours`).value = '';
  });
  document.getElementById('ts-note').value = '';
  openModal('modal-timesheet');
}
document.getElementById('btn-add-timesheet')?.addEventListener('click', openTimesheetModal);

function openTimesheetEditModal(id){
  const t = TIMESHEETS.find(x=>x.id===id);
  if(!t) return;
  document.getElementById('ts-id').value = id;
  document.getElementById('ts-employee').value = t.employeeId || '';
  document.getElementById('ts-date').value = t.date || '';
  const shifts = t.shifts || {};
  ['sang','chieu','toi'].forEach(shift=>{
    const s = shifts[shift] || {};
    document.getElementById(`ts-${shift}-project`).value = s.projectId || '';
    document.getElementById(`ts-${shift}-hours`).value = s.hours || '';
  });
  document.getElementById('ts-note').value = t.note || '';
  openModal('modal-timesheet');
}

document.getElementById('save-ts-btn').addEventListener('click', async ()=>{
  const id = document.getElementById('ts-id').value;
  const employeeId = document.getElementById('ts-employee').value;
  const date = document.getElementById('ts-date').value;
  if(!employeeId || !date){ toast('Vui lòng chọn nhân viên và ngày'); return; }
  const emp = EMPLOYEES.find(x=>x.id===employeeId);

  const buildShift = (key)=>{
    const projectId = document.getElementById(`ts-${key}-project`).value;
    const proj = projectId ? projectById(projectId) : null;
    const hours = Number(document.getElementById(`ts-${key}-hours`).value) || 0;
    return { projectId, projectName: proj ? proj.name : '', hours };
  };
  const shifts = { sang: buildShift('sang'), chieu: buildShift('chieu'), toi: buildShift('toi') };
  if(!shifts.sang.hours && !shifts.chieu.hours && !shifts.toi.hours){
    toast('Vui lòng nhập ít nhất 1 ca có số giờ'); return;
  }

  const data = {
    employeeId, employeeName: emp ? emp.name : '',
    date, shifts,
    note: document.getElementById('ts-note').value.trim(),
  };
  try{
    if(id){
      await db.collection('timesheets').doc(id).update(data);
      toast('Đã cập nhật chấm công');
      logActivity('update', {projectName:'Chấm công', content: data.employeeName+' - '+data.date, type:'OUT'});
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = auth.currentUser.email;
      await db.collection('timesheets').add(data);
      toast('Đã lưu chấm công');
      logActivity('create', {projectName:'Chấm công', content: data.employeeName+' - '+data.date, type:'OUT'});
    }
    closeModal('modal-timesheet');
  }catch(err){ toast('Lỗi: '+err.message); }
});

function getFilteredTimesheets(){
  const month = document.getElementById('ts-filter-month').value;
  const employee = document.getElementById('ts-filter-employee').value;
  return TIMESHEETS.filter(t=>{
    if(month && monthKey(t.date)!==month) return false;
    if(employee && t.employeeId!==employee) return false;
    return true;
  });
}

// Giờ thường (Sáng+Chiều) & giờ tăng ca (Tối) của 1 dòng chấm công
function tsHours(t){
  const s = t.shifts || {};
  const regular = (s.sang?.hours||0) + (s.chieu?.hours||0);
  const ot = s.toi?.hours || 0;
  return { regular, ot, total: regular + ot };
}

function shiftCell(shift){
  if(!shift || !shift.hours) return '<span class="helper-text">—</span>';
  return `<div>${escapeHtml(shift.projectName||'—')}</div><div class="num" style="font-size:11.5px;color:var(--ink-faint);">${shift.hours}h</div>`;
}

function renderTimesheetTable(){
  const table = document.getElementById('timesheet-table');
  if(!table) return;
  const rows = getFilteredTimesheets().slice().sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  if(rows.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">🗓</div>Chưa có dữ liệu chấm công.</div></td></tr>`;
    return;
  }
  table.innerHTML = `<thead><tr>
    <th>Ngày</th><th>Nhân viên</th><th>☀️ Sáng</th><th>🌤 Chiều</th><th>🌙 Tối (OT)</th><th>Giờ thường</th><th>Giờ TC</th><th>Tổng giờ</th><th></th>
  </tr></thead><tbody>${rows.map(t=>{
    const h = tsHours(t);
    const s = t.shifts || {};
    return `<tr>
      <td>${fmtDate(t.date)}</td>
      <td><strong>${escapeHtml(t.employeeName||'—')}</strong></td>
      <td>${shiftCell(s.sang)}</td>
      <td>${shiftCell(s.chieu)}</td>
      <td>${shiftCell(s.toi)}</td>
      <td class="num">${h.regular}h</td>
      <td class="num" style="color:var(--gold);">${h.ot}h</td>
      <td class="num"><strong>${h.total}h</strong></td>
      <td>
        <div class="row-actions">
          ${!isSubAdmin() ? `<button class="icon-btn" data-edit-ts="${t.id}" title="Sửa">✎</button>` : ''}
          ${isAdmin() ? `<button class="icon-btn" data-del-ts="${t.id}" title="Xóa">🗑</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('')}</tbody>`;
}
document.getElementById('timesheet-table')?.addEventListener('click', (e)=>{
  const editId = e.target.closest('[data-edit-ts]')?.dataset.editTs;
  const delId = e.target.closest('[data-del-ts]')?.dataset.delTs;
  if(editId) openTimesheetEditModal(editId);
  if(delId && confirmDelete('Xóa dòng chấm công này?')){
    const ts = TIMESHEETS.find(x=>x.id===delId);
    db.collection('timesheets').doc(delId).delete().then(()=>{
      toast('Đã xóa');
      if(ts) logActivity('delete', {projectName:'Chấm công', content: (ts.employeeName||'')+' - '+(ts.date||''), type:'OUT'});
    });
  }
});

// Tổng hợp công theo tháng (mỗi nhân viên 1 dòng)
function renderTimesheetSummary(){
  const table = document.getElementById('ts-summary-table');
  if(!table) return;
  const rows = getFilteredTimesheets();
  const byEmp = {};
  rows.forEach(t=>{
    if(!byEmp[t.employeeId]) byEmp[t.employeeId] = { name: t.employeeName, regular:0, ot:0, projects:new Set() };
    const h = tsHours(t);
    byEmp[t.employeeId].regular += h.regular;
    byEmp[t.employeeId].ot += h.ot;
    Object.values(t.shifts||{}).forEach(s=>{ if(s && s.projectName) byEmp[t.employeeId].projects.add(s.projectName); });
  });
  const list = Object.values(byEmp).sort((a,b)=> a.name.localeCompare(b.name,'vi'));
  if(list.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">🗓</div>Chưa có dữ liệu tháng này.</div></td></tr>`;
    return;
  }
  table.innerHTML = `<thead><tr>
    <th>Nhân viên</th><th>Giờ thường</th><th>Giờ tăng ca</th><th>Tổng giờ công</th><th>Dự án đã làm</th>
  </tr></thead><tbody>${list.map(r=>`
    <tr>
      <td><strong>${escapeHtml(r.name)}</strong></td>
      <td class="num">${r.regular}h</td>
      <td class="num" style="color:var(--gold);">${r.ot}h</td>
      <td class="num"><strong>${r.regular+r.ot}h</strong></td>
      <td>${[...r.projects].map(p=>`<span class="tag tag-gray">${escapeHtml(p)}</span>`).join(' ') || '—'}</td>
    </tr>`).join('')}</tbody>`;
}
['ts-filter-month','ts-filter-employee'].forEach(id=>{
  document.getElementById(id)?.addEventListener('change', ()=>{ renderTimesheetTable(); renderTimesheetSummary(); });
});
document.getElementById('ts-filter-month').value = todayISO().slice(0,7);

// ---------------- TÍNH LƯƠNG THÁNG (khớp công thức đã xác minh) ----------------
function computeEmployeeSalary(emp, month){
  const empTimesheets = TIMESHEETS.filter(t=> t.employeeId===emp.id && monthKey(t.date)===month);
  let totalHours = 0;
  const projectHours = {}; // projectName -> hours (để phân bổ chi phí theo dự án)
  empTimesheets.forEach(t=>{
    const h = tsHours(t);
    totalHours += h.total;
    Object.values(t.shifts||{}).forEach(s=>{
      if(s && s.hours){
        const key = s.projectName || 'Không thuộc dự án';
        projectHours[key] = (projectHours[key]||0) + s.hours;
      }
    });
  });

  const totalIncome = emp.payType === 'daily'
    ? Math.round((totalHours/8) * Number(emp.effectiveRate||0))
    : Math.round(Number(emp.contractSalary||0) + Number(emp.effectiveRate||0));

  const adj = PAYROLL_ADJUSTMENTS.find(a=> a.employeeId===emp.id && a.month===month) || {};
  const bhxh = (adj.bhxhOverride !== undefined && adj.bhxhOverride !== null && adj.bhxhOverride !== '')
    ? Number(adj.bhxhOverride) : Math.round(Number(emp.contractSalary||0) * 0.105);
  const tamUng = Number(adj.tamUngCuoiThang||0);
  const ungTuan = Number(adj.tienUngMrTuan||0);
  const thuong = Number(adj.thuongChuyenCan||0);
  const khacTamUng = Number(adj.khauTruTamUngKhac||0);
  const khauNghi = Number(adj.khauTruNgayNghi||0);
  const thucNhan = totalIncome - bhxh - tamUng - ungTuan - thuong - khacTamUng - khauNghi;

  return { emp, month, totalHours, projectHours, totalIncome, bhxh, tamUng, ungTuan, thuong, khacTamUng, khauNghi, thucNhan, adj };
}

function currentPayrollMonth(){
  return document.getElementById('payroll-filter-month').value || todayISO().slice(0,7);
}

function renderPayrollSummary(){
  const table = document.getElementById('payroll-summary-table');
  if(!table) return;
  const month = currentPayrollMonth();
  if(EMPLOYEES.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">💵</div>Chưa có nhân viên nào.</div></td></tr>`;
    renderPayrollProjectCost(month, []);
    return;
  }
  const results = EMPLOYEES.map(e=> computeEmployeeSalary(e, month));

  table.innerHTML = `<thead><tr>
    <th>Nhân viên</th><th>Nhóm</th><th>Tổng thu nhập</th><th>BHXH</th><th>Tạm ứng/Khấu trừ</th><th>Thực nhận</th><th></th>
  </tr></thead><tbody>${results.map(r=>{
    const otherDeduct = r.tamUng + r.ungTuan + r.thuong + r.khacTamUng + r.khauNghi;
    return `<tr>
      <td><a href="#" class="tag tag-blue" data-open-adjust="${r.emp.id}" style="text-decoration:none;"><strong>${escapeHtml(r.emp.name)}</strong></a><div class="helper-text">${escapeHtml(r.emp.position||'')}</div></td>
      <td>${r.emp.payType==='daily' ? '<span class="tag tag-gold">Công nhân</span>' : '<span class="tag tag-blue">Quản lý</span>'}</td>
      <td class="num">${fmtVND(r.totalIncome)}</td>
      <td class="num" style="color:var(--red);">${fmtVND(r.bhxh)}</td>
      <td class="num" style="color:var(--red);">${fmtVND(otherDeduct)}</td>
      <td class="num"><strong style="color:var(--teal);">${fmtVND(r.thucNhan)}</strong></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-open-adjust="${r.emp.id}" title="Điều chỉnh tháng này">✎</button>
          <button class="icon-btn" data-print-payslip="${r.emp.id}" title="Xuất phiếu lương PDF">🖨</button>
        </div>
      </td>
    </tr>`;
  }).join('')}</tbody>`;

  renderPayrollProjectCost(month, results);
}

// Phân bổ chi phí lương theo dự án: mỗi NV chia Tổng thu nhập theo TỈ LỆ giờ công của từng dự án trong tháng
function renderPayrollProjectCost(month, results){
  const table = document.getElementById('payroll-project-cost-table');
  if(!table) return;
  const totals = {};
  results.forEach(r=>{
    const sumProjHours = Object.values(r.projectHours).reduce((s,h)=>s+h,0);
    if(sumProjHours <= 0) return;
    Object.entries(r.projectHours).forEach(([projName, hours])=>{
      const share = (hours / sumProjHours) * r.totalIncome;
      totals[projName] = (totals[projName]||0) + share;
    });
  });
  const list = Object.entries(totals).map(([name,amount])=>({name, amount})).sort((a,b)=>b.amount-a.amount);
  if(list.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">🏗</div>Chưa có dữ liệu chấm công theo dự án tháng này.</div></td></tr>`;
    return;
  }
  const grandTotal = list.reduce((s,x)=>s+x.amount,0);
  table.innerHTML = `<thead><tr><th>Dự án</th><th>Chi phí lương phân bổ</th></tr></thead><tbody>
    ${list.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td class="num"><strong>${fmtVND(x.amount)}</strong></td></tr>`).join('')}
    <tr style="border-top:2px solid var(--line);"><td><strong>Tổng cộng</strong></td><td class="num"><strong>${fmtVND(grandTotal)}</strong></td></tr>
  </tbody>`;
}

document.getElementById('payroll-filter-month')?.addEventListener('change', renderPayrollSummary);
document.getElementById('payroll-filter-month').value = todayISO().slice(0,7);

document.getElementById('payroll-summary-table')?.addEventListener('click', (e)=>{
  const adjId = e.target.closest('[data-open-adjust]')?.dataset.openAdjust;
  const printId = e.target.closest('[data-print-payslip]')?.dataset.printPayslip;
  if(adjId){ e.preventDefault(); openPayrollAdjustModal(adjId); }
  if(printId) printPayslip(printId);
});

// ---------------- Điều chỉnh lương riêng từng tháng ----------------
function openPayrollAdjustModal(employeeId){
  const emp = EMPLOYEES.find(x=>x.id===employeeId);
  if(!emp) return;
  const month = currentPayrollMonth();
  const r = computeEmployeeSalary(emp, month);
  document.getElementById('pa-modal-title').textContent = `Điều chỉnh lương — ${emp.name} (${month})`;
  document.getElementById('pa-employee-id').value = employeeId;
  document.getElementById('pa-month').value = month;
  document.getElementById('pa-summary').innerHTML =
    `Tổng giờ công: <strong>${r.totalHours}h</strong> · Tổng thu nhập (trước khấu trừ): <strong>${fmtVND(r.totalIncome)}</strong>`;
  setMoneyInputValue(document.getElementById('pa-bhxh'), r.adj.bhxhOverride ?? Math.round(Number(emp.contractSalary||0)*0.105));
  setMoneyInputValue(document.getElementById('pa-tamung'), r.adj.tamUngCuoiThang);
  setMoneyInputValue(document.getElementById('pa-ungtuan'), r.adj.tienUngMrTuan);
  setMoneyInputValue(document.getElementById('pa-thuong'), r.adj.thuongChuyenCan);
  setMoneyInputValue(document.getElementById('pa-khactamung'), r.adj.khauTruTamUngKhac);
  setMoneyInputValue(document.getElementById('pa-khaunghi'), r.adj.khauTruNgayNghi);
  document.getElementById('pa-note').value = r.adj.note || '';
  openModal('modal-payroll-adjust');
}

document.getElementById('save-pa-btn')?.addEventListener('click', async ()=>{
  const employeeId = document.getElementById('pa-employee-id').value;
  const month = document.getElementById('pa-month').value;
  const emp = EMPLOYEES.find(x=>x.id===employeeId);
  const data = {
    employeeId, month, employeeName: emp ? emp.name : '',
    bhxhOverride: parseMoneyInput(document.getElementById('pa-bhxh')),
    tamUngCuoiThang: parseMoneyInput(document.getElementById('pa-tamung')),
    tienUngMrTuan: parseMoneyInput(document.getElementById('pa-ungtuan')),
    thuongChuyenCan: parseMoneyInput(document.getElementById('pa-thuong')),
    khauTruTamUngKhac: parseMoneyInput(document.getElementById('pa-khactamung')),
    khauTruNgayNghi: parseMoneyInput(document.getElementById('pa-khaunghi')),
    note: document.getElementById('pa-note').value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: auth.currentUser.email,
  };
  try{
    await db.collection('payrollAdjustments').doc(`${employeeId}_${month}`).set(data, {merge:true});
    toast('Đã lưu điều chỉnh lương');
    logActivity('update', {projectName:'Điều chỉnh lương', content: data.employeeName+' - '+month, type:'OUT'});
    closeModal('modal-payroll-adjust');
  }catch(err){ toast('Lỗi: '+err.message); }
});

// ---------------- XUẤT PHIẾU LƯƠNG PDF (in qua trình duyệt — Lưu dưới dạng PDF) ----------------
function printPayslip(employeeId){
  const emp = EMPLOYEES.find(x=>x.id===employeeId);
  if(!emp) return;
  const month = currentPayrollMonth();
  const r = computeEmployeeSalary(emp, month);
  const [y,m] = month.split('-');
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Phiếu lương - ${escapeHtml(emp.name)}</title>
    <style>
      body{font-family:'Times New Roman',serif;padding:36px;color:#111;max-width:650px;margin:0 auto;}
      h2{text-align:center;text-transform:uppercase;margin-bottom:2px;letter-spacing:1px;}
      .sub-center{text-align:center;color:#555;margin-bottom:24px;}
      .info-row{display:flex;gap:30px;margin-bottom:6px;font-size:14px;}
      .info-row b{min-width:110px;display:inline-block;}
      table{width:100%;border-collapse:collapse;margin-top:20px;font-size:13.5px;}
      th,td{border:1px solid #999;padding:8px 10px;text-align:left;}
      th{background:#f0f0f0;text-align:center;}
      td.num{text-align:right;font-variant-numeric:tabular-nums;}
      tr.total td{font-weight:bold;background:#fafafa;font-size:15px;}
      tr.total td.num{color:#0a6b47;}
      .sig{display:flex;justify-content:space-between;margin-top:70px;text-align:center;font-size:13.5px;}
      .sig div{width:40%;}
      .sig .line{margin-top:60px;border-top:1px solid #333;padding-top:6px;}
    </style></head><body>
    <h2>Phiếu lương</h2>
    <div class="sub-center">Tháng ${Number(m)} / ${y}</div>
    <div class="info-row"><b>Họ và tên:</b> ${escapeHtml(emp.name)}</div>
    <div class="info-row"><b>Chức vụ:</b> ${escapeHtml(emp.position||'—')}</div>
    <div class="info-row"><b>Nhóm lương:</b> ${emp.payType==='daily' ? 'Công nhân (theo ngày công)' : 'Quản lý (lương tháng)'}</div>
    <table>
      <tr><th style="width:40px;">STT</th><th>Khoản mục</th><th style="width:150px;">Số tiền</th></tr>
      <tr><td>1</td><td>Tổng giờ công trong tháng</td><td class="num">${r.totalHours} giờ</td></tr>
      <tr><td>2</td><td>${emp.payType==='daily' ? 'Lương hiệu quả (VNĐ/ngày)' : 'Lương HĐLĐ + Lương hiệu quả (VNĐ/tháng)'}</td><td class="num">${fmtVND(emp.effectiveRate)}</td></tr>
      <tr><td>3</td><td><strong>Tổng thu nhập</strong></td><td class="num"><strong>${fmtVND(r.totalIncome)}</strong></td></tr>
      <tr><td>4</td><td>Khấu trừ BHXH</td><td class="num">- ${fmtVND(r.bhxh)}</td></tr>
      <tr><td>5</td><td>Tiền tạm ứng cuối tháng</td><td class="num">- ${fmtVND(r.tamUng)}</td></tr>
      <tr><td>6</td><td>Tiền ứng Mr.Tuấn</td><td class="num">- ${fmtVND(r.ungTuan)}</td></tr>
      <tr><td>7</td><td>Thưởng chuyên cần / Điều chỉnh khác</td><td class="num">- ${fmtVND(r.thuong)}</td></tr>
      <tr><td>8</td><td>Khấu trừ tạm ứng khác</td><td class="num">- ${fmtVND(r.khacTamUng)}</td></tr>
      <tr><td>9</td><td>Khấu trừ ngày nghỉ</td><td class="num">- ${fmtVND(r.khauNghi)}</td></tr>
      <tr class="total"><td colspan="2">THỰC LĨNH</td><td class="num">${fmtVND(r.thucNhan)}</td></tr>
    </table>
    ${r.adj.note ? `<p style="margin-top:14px;font-size:13px;color:#555;"><i>Ghi chú: ${escapeHtml(r.adj.note)}</i></p>` : ''}
    <div class="sig">
      <div>Người lập phiếu<div class="line">&nbsp;</div></div>
      <div>Người nhận lương<div class="line">${escapeHtml(emp.name)}</div></div>
    </div>
    </body></html>`);
  w.document.close();
  setTimeout(()=> w.print(), 300);
}
