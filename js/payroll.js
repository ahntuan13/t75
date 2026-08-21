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
  let payrollAllocCheckDone = false;
  db.collection('employees').orderBy('createdAt','asc').onSnapshot((snap)=>{
    EMPLOYEES = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    fillEmployeeSelects();
    renderEmployeesTable();
    renderPayrollSummary();
    renderTimesheetGrid();
    maybeCheckPayrollAllocation();
  }, (err)=> console.error('employees listen error', err));

  db.collection('timesheets').orderBy('date','desc').onSnapshot((snap)=>{
    TIMESHEETS = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    renderTimesheetTable();
    renderTimesheetSummary();
    renderTimesheetGrid();
    renderPayrollSummary();
    maybeCheckPayrollAllocation();
  }, (err)=> console.error('timesheets listen error', err));

  db.collection('payrollAdjustments').onSnapshot((snap)=>{
    PAYROLL_ADJUSTMENTS = snap.docs.map(d=> ({id:d.id, ...d.data()}));
    renderPayrollSummary();
  }, (err)=> console.error('payrollAdjustments listen error', err));

  // Chỉ kiểm tra phân bổ lương tự động 1 LẦN mỗi phiên, và chỉ khi CẢ Nhân viên lẫn Chấm công
  // đã có dữ liệu (đợi PROJECTS cũng đã sẵn sàng vì được tải sớm hơn ở nơi khác trong app).
  function maybeCheckPayrollAllocation(){
    if(payrollAllocCheckDone) return;
    if(EMPLOYEES.length === 0) return; // chưa chắc đã tải xong, đợi lần callback sau
    payrollAllocCheckDone = true;
    if(typeof checkMonthlyPayrollAllocation==='function') checkMonthlyPayrollAllocation();
  }
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

// Thứ tự cấp bậc (cao -> thấp) trong nhóm Quản lý — khớp đúng thứ tự trong file Bảng lương gốc.
// Chức vụ không nằm trong danh sách này sẽ xếp cuối, giữ nguyên thứ tự tương đối.
const POSITION_RANK = [
  'Giám Đốc', 'Phó Giám Đốc', 'Giám Đốc Dự Án', 'Quản Lý Dự Án',
  'Giám Sát', 'Kế Toán', 'Nhân Viên An Toàn',
];
function positionRank(position){
  const idx = POSITION_RANK.findIndex(p=> p.toLowerCase() === (position||'').trim().toLowerCase());
  return idx === -1 ? 999 : idx;
}

function renderEmployeesTable(){
  const table = document.getElementById('employees-table');
  if(!table) return;
  if(EMPLOYEES.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">👥</div>Chưa có nhân viên nào. Bấm "+ Tạo mới" hoặc Upload Excel để thêm.</div></td></tr>`;
    return;
  }
  const empRow = (e)=>`
    <tr>
      <td><strong>${escapeHtml(e.name)}</strong></td>
      <td>${escapeHtml(e.position||'—')}</td>
      <td class="num">${fmtVND(e.contractSalary)}</td>
      <td class="num">${fmtVND(e.effectiveRate)}${e.payType==='daily'?'/ngày':'/tháng'}</td>
      <td>
        <div class="row-actions">
          ${!isSubAdmin() ? `<button class="icon-btn" data-edit-emp="${e.id}" title="Sửa">✎</button>` : ''}
          ${isAdmin() ? `<button class="icon-btn" data-del-emp="${e.id}" title="Xóa">🗑</button>` : ''}
        </div>
      </td>
    </tr>`;
  const groupHeaderRow = (label, count)=> `<tr class="tx-subhead"><td colspan="5"><strong>${label}</strong> <span class="helper-text">(${count} người)</span></td></tr>`;

  const managers = EMPLOYEES.filter(e=>e.payType!=='daily').sort((a,b)=> positionRank(a.position)-positionRank(b.position) || a.name.localeCompare(b.name,'vi'));
  const workers = EMPLOYEES.filter(e=>e.payType==='daily').sort((a,b)=> a.name.localeCompare(b.name,'vi'));

  table.innerHTML = `<thead><tr>
    <th>Họ tên</th><th>Chức vụ</th><th>Lương HĐLĐ/BHXH</th><th>Lương hiệu quả</th><th></th>
  </tr></thead><tbody>
    ${managers.length ? groupHeaderRow('🔷 QUẢN LÝ', managers.length) + managers.map(empRow).join('') : ''}
    ${workers.length ? groupHeaderRow('🔶 CÔNG NHÂN', workers.length) + workers.map(empRow).join('') : ''}
  </tbody>`;
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
// Khung chấm công dạng LƯỚI giống Excel: hàng = nhân viên (chia nhóm QL/CN), cột = từng ngày trong tháng,
// mỗi ô hiện tổng giờ ngày đó (bấm vào để mở đúng modal 3 ca nhập/sửa giờ + chọn dự án), cột cuối tự cộng Tổng giờ tháng.
// Ngày lễ VN cố định theo dương lịch (Tết Dương lịch, Giỗ Tổ*, 30/4, 1/5, Quốc khánh).
// *Giỗ Tổ Hùng Vương và Tết Nguyên Đán tính theo âm lịch nên KHÔNG tính tự động được ở đây —
// nếu tháng đang xem có 2 dịp này, bạn tự đối chiếu thêm nhé.
// Lịch nghỉ lễ VN 2026 — đã tra cứu chính xác cả ngày ÂM LỊCH quy đổi ra dương lịch cho năm 2026
// (Tết Nguyên Đán, Giỗ Tổ Hùng Vương), không cần tự tính âm lịch. Ghi rõ tên từng ngày lễ để hiển thị.
// LƯU Ý: danh sách này CHỈ ĐÚNG CHO NĂM 2026 — Tết/Giỗ Tổ đổi ngày dương lịch mỗi năm, cần cập nhật lại nếu dùng cho năm khác.
const VN_HOLIDAYS_2026 = {
  '2026-01-01': 'Tết Dương lịch',
  '2026-02-16': 'Tết Nguyên Đán (29 Tết)',
  '2026-02-17': 'Tết Nguyên Đán (Mùng 1)',
  '2026-02-18': 'Tết Nguyên Đán (Mùng 2)',
  '2026-02-19': 'Tết Nguyên Đán (Mùng 3)',
  '2026-02-20': 'Tết Nguyên Đán (Mùng 4)',
  '2026-04-26': 'Giỗ Tổ Hùng Vương (10/3 âm)',
  '2026-04-30': 'Ngày Giải phóng 30/4',
  '2026-05-01': 'Quốc tế Lao động 1/5',
  '2026-09-02': 'Quốc khánh 2/9',
};
function vnHolidayName(dateStr){
  return VN_HOLIDAYS_2026[dateStr] || '';
}
function isVnHoliday(y, m, d){
  const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  return !!VN_HOLIDAYS_2026[dateStr];
}
// Hệ số lương theo NGÀY (áp dụng cho ca Sáng/Chiều, và cả ngày nếu là Lễ/Chủ nhật): Lễ x3, Chủ nhật x2, ngày thường x1.
function dayPayMultiplier(dateStr){
  if(VN_HOLIDAYS_2026[dateStr]) return 3;
  const dow = new Date(dateStr+'T00:00:00').getDay();
  if(dow === 0) return 2; // Chủ nhật
  return 1;
}
// Hệ số riêng cho ca TỐI (tăng ca sau 17h01): ngày thường = x1.5; nếu rơi vào Chủ nhật/Lễ thì dùng
// LUÔN hệ số ngày đó (x2/x3) — không cộng dồn 2 lớp hệ số chồng lên nhau.
function eveningShiftMultiplier(dateStr){
  const dayMult = dayPayMultiplier(dateStr);
  if(dayMult > 1) return dayMult; // Lễ/CN: cả ngày (kể cả ca Tối) tính theo hệ số ngày cao hơn
  return 1.5; // Ngày thường: ca Tối = tăng ca x1.5
}

function renderTimesheetGrid(){
  const table = document.getElementById('ts-grid-table');
  if(!table) return;
  const month = document.getElementById('ts-filter-month').value || todayISO().slice(0,7);
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = Array.from({length: daysInMonth}, (_, i) => i+1);
  const dayMeta = days.map(d=>{
    const dow = new Date(y, m-1, d).getDay(); // 0=CN, 6=T7
    const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return {
      d, dateStr, isWeekend: dow===0 || dow===6, isSunday: dow===0,
      isHoliday: isVnHoliday(y,m,d), holidayName: vnHolidayName(dateStr),
      dowLabel: ['CN','T2','T3','T4','T5','T6','T7'][dow],
      multiplier: dayPayMultiplier(dateStr),
    };
  });

  const empFilter = document.getElementById('ts-filter-employee').value;
  const emps = empFilter ? EMPLOYEES.filter(e=>e.id===empFilter) : EMPLOYEES;
  if(emps.length === 0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">🗓</div>Chưa có nhân viên nào.</div></td></tr>`;
    return;
  }

  // Gom timesheet của tháng theo employeeId + ngày để tra cứu nhanh
  const byEmpDay = {};
  TIMESHEETS.filter(t=> monthKey(t.date)===month).forEach(t=>{
    byEmpDay[`${t.employeeId}_${t.date}`] = t;
  });

  const dayHeaderCells = dayMeta.map(dm=> {
    const isSat = dm.isWeekend && !dm.isSunday;
    const bg = dm.isHoliday ? 'var(--red-dim)' : dm.isSunday ? 'var(--gold-dim)' : isSat ? 'var(--blue-dim)' : 'var(--bg-soft)';
    const color = dm.isHoliday ? 'var(--red)' : dm.isSunday ? '#9a6b00' : isSat ? 'var(--blue)' : 'var(--ink-dim)';
    const tip = dm.isHoliday ? dm.holidayName : (dm.isSunday ? 'Chủ nhật — hệ số x2' : isSat ? 'Thứ 7' : dm.dowLabel);
    const mult = dm.multiplier > 1 ? `<div style="font-size:8.5px;font-weight:800;">x${dm.multiplier}</div>` : '';
    return `<th style="min-width:52px;background:${bg};color:${color};" title="${escapeHtml(tip)}">${dm.d}<div style="font-size:9px;font-weight:600;opacity:.8;">${dm.isHoliday ? '🎌' : dm.dowLabel}</div>${mult}</th>`;
  }).join('');
  const empRow = (e)=>{
    let monthTotal = 0;
    const cells = dayMeta.map(dm=>{
      const d = dm.d;
      const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const t = byEmpDay[`${e.id}_${dateStr}`];
      const h = t ? tsHours(t) : {regular:0, ot:0, total:0};
      monthTotal += h.total;
      const label = h.total > 0 ? h.total : '';
      const otMark = h.ot > 0 ? `<div style="font-size:9.5px;color:var(--gold);">+${h.ot} TC</div>` : '';
      const cellBg = dm.isHoliday ? 'background:var(--red-dim);' : dm.isSunday ? 'background:var(--gold-dim);' : (dm.isWeekend && !dm.isSunday) ? 'background:var(--blue-dim);' : '';
      return `<td class="num" style="cursor:pointer;padding:4px;${cellBg}${h.total>0?'':'color:var(--ink-faint);'}" data-grid-cell="${e.id}|${dateStr}">${label}${otMark}</td>`;
    }).join('');
    return `<tr><td style="position:sticky;left:0;background:var(--card);white-space:nowrap;"><strong>${escapeHtml(e.name)}</strong></td>${cells}<td class="num" style="font-weight:800;">${monthTotal}h</td></tr>`;
  };
  const groupHeaderRow = (label)=> `<tr class="tx-subhead"><td colspan="${days.length+2}"><strong>${label}</strong></td></tr>`;
  const managers = emps.filter(e=>e.payType!=='daily').sort((a,b)=> positionRank(a.position)-positionRank(b.position) || a.name.localeCompare(b.name,'vi'));
  const workers = emps.filter(e=>e.payType==='daily').sort((a,b)=> a.name.localeCompare(b.name,'vi'));

  table.innerHTML = `<thead><tr>
    <th style="position:sticky;left:0;background:var(--bg-soft);">Nhân viên</th>${dayHeaderCells}<th>Tổng giờ</th>
  </tr></thead><tbody>
    ${managers.length ? groupHeaderRow('🔷 QUẢN LÝ') + managers.map(empRow).join('') : ''}
    ${workers.length ? groupHeaderRow('🔶 CÔNG NHÂN') + workers.map(empRow).join('') : ''}
  </tbody>`;
}
document.getElementById('ts-grid-table')?.addEventListener('click', (e)=>{
  const cell = e.target.closest('[data-grid-cell]');
  if(!cell) return;
  const [employeeId, date] = cell.dataset.gridCell.split('|');
  const existing = TIMESHEETS.find(t=> t.employeeId===employeeId && t.date===date);
  if(existing){
    openTimesheetEditModal(existing.id);
  } else {
    openTimesheetModal();
    document.getElementById('ts-employee').value = employeeId;
    document.getElementById('ts-date').value = date;
  }
});

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
  document.getElementById(id)?.addEventListener('change', ()=>{ renderTimesheetTable(); renderTimesheetSummary(); renderTimesheetGrid(); });
});
document.getElementById('ts-filter-month').value = todayISO().slice(0,7);

// ---------------- TÍNH LƯƠNG THÁNG (khớp công thức đã xác minh) ----------------
function computeEmployeeSalary(emp, month){
  const empTimesheets = TIMESHEETS.filter(t=> t.employeeId===emp.id && monthKey(t.date)===month);
  let totalHours = 0;
  let weightedHours = 0; // Giờ QUY ĐỔI theo hệ số: Lễ x3 / Chủ nhật x2 (cả ngày) / ca Tối ngày thường x1.5 — dùng để tính lương Công nhân
  const projectHours = {}; // projectName -> hours (để phân bổ chi phí theo dự án)
  empTimesheets.forEach(t=>{
    const h = tsHours(t);
    totalHours += h.total;
    const dayMult = (typeof dayPayMultiplier==='function') ? dayPayMultiplier(t.date) : 1;
    const eveMult = (typeof eveningShiftMultiplier==='function') ? eveningShiftMultiplier(t.date) : 1;
    // Giờ Sáng+Chiều dùng hệ số NGÀY; riêng giờ ca Tối dùng hệ số CA TỐI (ngày thường x1.5, Lễ/CN thì bằng hệ số ngày).
    weightedHours += h.regular * dayMult + h.ot * eveMult;
    Object.values(t.shifts||{}).forEach(s=>{
      if(s && s.hours){
        const key = s.projectName || 'Không thuộc dự án';
        projectHours[key] = (projectHours[key]||0) + s.hours;
      }
    });
  });

  const totalIncome = emp.payType === 'daily'
    ? Math.round((weightedHours/8) * Number(emp.effectiveRate||0))
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

  return { emp, month, totalHours, weightedHours, projectHours, totalIncome, bhxh, tamUng, ungTuan, thuong, khacTamUng, khauNghi, thucNhan, adj };
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
  const rowHtml = (r)=>{
    const otherDeduct = r.tamUng + r.ungTuan + r.thuong + r.khacTamUng + r.khauNghi;
    return `<tr>
      <td><a href="#" class="tag tag-blue" data-open-adjust="${r.emp.id}" style="text-decoration:none;"><strong>${escapeHtml(r.emp.name)}</strong></a><div class="helper-text">${escapeHtml(r.emp.position||'')}</div></td>
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
  };
  const groupHeaderRow = (label, count)=> `<tr class="tx-subhead"><td colspan="6"><strong>${label}</strong> <span class="helper-text">(${count} người)</span></td></tr>`;
  const managers = results.filter(r=>r.emp.payType!=='daily').sort((a,b)=> positionRank(a.emp.position)-positionRank(b.emp.position) || a.emp.name.localeCompare(b.emp.name,'vi'));
  const workers = results.filter(r=>r.emp.payType==='daily').sort((a,b)=> a.emp.name.localeCompare(b.emp.name,'vi'));

  table.innerHTML = `<thead><tr>
    <th>Nhân viên</th><th>Tổng thu nhập</th><th>BHXH</th><th>Tạm ứng/Khấu trừ</th><th>Thực nhận</th><th></th>
  </tr></thead><tbody>
    ${managers.length ? groupHeaderRow('🔷 QUẢN LÝ', managers.length) + managers.map(rowHtml).join('') : ''}
    ${workers.length ? groupHeaderRow('🔶 CÔNG NHÂN', workers.length) + workers.map(rowHtml).join('') : ''}
  </tbody>`;

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

// ---------------- TỰ ĐỘNG PHÂN BỔ LƯƠNG VÀO THU CHI DỰ ÁN — ngày 15 hàng tháng ----------------
// Do app tĩnh không có server chạy nền, áp dụng đúng nguyên tắc "kiểm tra khi mở app" giống sao lưu:
// mỗi khi ADMIN mở app từ ngày 15 trở đi mà THÁNG NÀY CHƯA phân bổ lương, hệ thống tự tạo các khoản Chi
// "Thanh toán lương CNV tháng X" vào ĐÚNG dự án tương ứng (theo tỉ lệ giờ công), phần không thuộc dự án
// nào thì vào Chi phí gián tiếp. Chạy xong ghi lại để tháng đó không bị tạo trùng lần 2.
async function runMonthlyPayrollAllocation(month){
  const [y, m] = month.split('-');
  const results = EMPLOYEES.map(e=> computeEmployeeSalary(e, month));
  const totals = {}; // projectName -> tổng tiền phân bổ
  results.forEach(r=>{
    const sumProjHours = Object.values(r.projectHours).reduce((s,h)=>s+h,0);
    if(sumProjHours <= 0) return;
    Object.entries(r.projectHours).forEach(([projName, hours])=>{
      const share = (hours / sumProjHours) * r.totalIncome;
      totals[projName] = (totals[projName]||0) + share;
    });
  });
  const entries = Object.entries(totals).filter(([,amt])=> amt > 0);
  if(entries.length === 0) return false;

  const batch = db.batch();
  entries.forEach(([projName, amount])=>{
    const proj = PROJECTS.find(p=> p.name === projName);
    const targetCollection = proj ? 'transactions' : 'fixedCosts'; // "Không thuộc dự án" -> Chi phí gián tiếp
    const ref = db.collection(targetCollection).doc();
    batch.set(ref, {
      type:'OUT', projectId: proj ? proj.id : '', projectName: proj ? proj.name : '',
      date: `${y}-${m}-15`, code:'NC',
      content: `Thanh toán lương CNV tháng ${Number(m)}`,
      description: 'Tự động phân bổ chi phí lương theo tỉ lệ giờ công từng dự án',
      unit:'', qty:0, unitPrice:0, amount: Math.round(amount),
      invoiceNumber:'', invoiceDate:'', bankName:'', bankAccount:'', bankHolder:'', transferDate:'',
      note: `Tự động tạo từ phân bổ lương tháng ${month}`,
      invoiceImage:'', transferImage:'', invoiceStatus:'pending', transferStatus:'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: auth.currentUser.email,
    });
  });
  await batch.commit();
  await db.collection('settings').doc('payrollAllocationMeta').set({ lastAllocatedMonth: month }, {merge:true});
  logActivity('create', {projectName:'Phân bổ lương tự động', content:`Lương tháng ${month} vào ${entries.length} dự án`, type:'OUT'});
  toast(`💰 Đã tự động phân bổ lương tháng ${Number(m)} vào Thu Chi (${entries.length} dự án)`);
  return true;
}

async function checkMonthlyPayrollAllocation(){
  try{
    if(!isAdmin()) return;
    const now = new Date();
    if(now.getDate() < 15) return; // chưa tới ngày 15 thì chưa phân bổ, chờ lần mở app sau
    const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const snap = await db.collection('settings').doc('payrollAllocationMeta').get();
    const lastMonth = snap.exists ? snap.data().lastAllocatedMonth : null;
    if(lastMonth === month) return; // tháng này đã phân bổ rồi
    await runMonthlyPayrollAllocation(month);
  }catch(err){ console.error('checkMonthlyPayrollAllocation error', err); }
}

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
// Ánh xạ email đăng nhập -> {tên hiển thị, ảnh chữ ký} — "Người lập phiếu" trên phiếu lương LUÔN là
// đúng người đang đăng nhập bấm in, không cố định 1 tên như trước.
// ⚠️ Email của Diễm My mình tạm đoán theo mẫu email công ty — báo lại email chính xác nếu chưa đúng nhé,
// mình sẽ sửa lại trong 1 dòng.
function currentPreparerInfo(){
  const email = (auth.currentUser && auth.currentUser.email || '').toLowerCase();
  const sigMap = {
    'hoaithuong@tuan75insulation.com': { name: 'Hoài Thương', sig: (typeof SIGNATURES!=='undefined' ? SIGNATURES.accountant.img : '') },
    'diemmy@tuan75insulation.com':     { name: 'Diễm My',     sig: (typeof SIGNATURES!=='undefined' ? SIGNATURES.preparer.img : '') },
  };
  if(sigMap[email]) return sigMap[email];
  return { name: (typeof CURRENT_USER_NAME!=='undefined' && CURRENT_USER_NAME) || email.split('@')[0] || 'Kế toán', sig: '' };
}

function printPayslip(employeeId){
  const emp = EMPLOYEES.find(x=>x.id===employeeId);
  if(!emp) return;
  const month = currentPayrollMonth();
  const r = computeEmployeeSalary(emp, month);
  const [y,m] = month.split('-');
  const empIndex = EMPLOYEES.findIndex(x=>x.id===employeeId) + 1;
  const preparer = currentPreparerInfo();
  const days = Math.round((r.totalHours/8)*1000)/1000;
  const dayRate = emp.payType==='daily' ? emp.effectiveRate : Math.round(r.totalIncome/30);

  // Đúng 15 dòng khoản mục theo mẫu Excel gốc công ty (STT | KHOẢN MỤC | SỐ TIỀN)
  const rows = [
    [1, 'TỔNG CÔNG [2]=[1]/8', `${days} công`],
    [2, 'NGÀY CÔNG', fmtVND(dayRate)],
    [3, 'THÀNH TIỀN [4]=[2]×[3]', fmtVND(r.totalIncome)],
    [4, 'TIỀN TẠM ỨNG CUỐI THÁNG', fmtVND(r.tamUng)],
    [5, 'TIỀN ỨNG MR/MS TUẤN', fmtVND(r.ungTuan)],
    [6, 'TẠM ỨNG CÁ NHÂN (TẠM ỨNG TẾT)', fmtVND(r.thuong)],
    [7, 'KHẤU TRỪ TIỀN NGHỈ', fmtVND(r.khauNghi)],
    [8, 'KHẤU TRỪ TIỀN TẠM ỨNG KHÁC', fmtVND(r.khacTamUng)],
    [9, 'THÁNG ĐÃ THANH TOÁN', fmtVND(0)],
    [10, 'KHẤU TRỪ BHXH (THÁNG)', fmtVND(r.bhxh)],
    [11, 'TIỀN LƯƠNG ĐẾN THÁNG CÒN DƯƠNG', fmtVND(0)],
    [12, 'TIỀN LƯƠNG ĐẾN THÁNG CÒN ÂM', fmtVND(0)],
    [13, 'PHỤ CẤP', fmtVND(0)],
    [14, 'HỖ TRỢ', fmtVND(0)],
    [15, 'THỰC LĨNH', fmtVND(r.thucNhan)],
  ];

  const html = `
    <html><head><title>Phiếu lương - ${escapeHtml(emp.name)}</title>
    <style>
      @page{size:A5 portrait;margin:12mm;}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12.5px;margin:0;}
      .top{display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;}
      h2{text-align:center;text-transform:uppercase;margin:6px 0 2px;letter-spacing:1px;font-size:17px;}
      .sub-center{text-align:center;color:#555;margin-bottom:14px;font-size:12px;}
      .info-row{margin-bottom:4px;font-size:13px;}
      .info-row b{display:inline-block;min-width:95px;}
      table{width:100%;border-collapse:collapse;margin-top:8px;}
      th,td{border:1px solid #999;padding:5px 8px;text-align:left;font-size:12px;}
      th{background:#fff6cc;text-align:center;font-weight:700;}
      td.stt{text-align:center;width:24px;}
      td.num{text-align:right;font-variant-numeric:tabular-nums;}
      tr.total td{font-weight:800;background:#fafafa;font-size:13.5px;}
      tr.total td.num{color:#0a6b47;}
      .sig{display:flex;justify-content:space-between;margin-top:26px;text-align:center;font-size:12px;}
      .sig .col{width:31%;}
      .sig .space{height:52px;display:flex;align-items:center;justify-content:center;}
      .sig .space img{max-height:52px;max-width:100%;}
    </style></head><body>
    <div class="top"><span>Mã nhân viên: <b>${empIndex}</b></span><span>Tháng ${Number(m)}/${y}</span></div>
    <h2>Phiếu lương</h2>
    <div class="info-row"><b>Họ và tên:</b> ${escapeHtml(emp.name)}</div>
    <div class="info-row"><b>Chức vụ:</b> ${escapeHtml(emp.position||'—')}</div>
    <table>
      <thead><tr><th>STT</th><th>Khoản mục</th><th style="width:120px;">Số tiền</th></tr></thead>
      <tbody>
        ${rows.map(([stt,label,val], idx)=> idx===rows.length-1
          ? `<tr class="total"><td class="stt">${stt}</td><td>${label}</td><td class="num">${val}</td></tr>`
          : `<tr><td class="stt">${stt}</td><td>${label}</td><td class="num">${val}</td></tr>`
        ).join('')}
      </tbody>
    </table>
    ${r.adj.note ? `<p style="margin-top:10px;font-size:11.5px;color:#555;"><i>Ghi chú: ${escapeHtml(r.adj.note)}</i></p>` : ''}
    <div class="sig">
      <div class="col">
        <div><strong>Người lập phiếu</strong></div>
        <div class="space">${preparer.sig ? `<img src="${preparer.sig}">` : ''}</div>
        <div>${escapeHtml(preparer.name)}</div>
      </div>
      <div class="col">
        <div><strong>Kế toán trưởng</strong></div>
        <div class="space"></div>
        <div>&nbsp;</div>
      </div>
      <div class="col">
        <div><strong>Người nhận lương</strong></div>
        <div class="space"></div>
        <div>${escapeHtml(emp.name)}</div>
      </div>
    </div>
    </body></html>`;

  // In ngay trong khung hiện tại (iframe ẩn) — giống hệt cách in Lệnh chi/Lệnh tạm ứng, không mở tab mới.
  let frame = document.getElementById('print-order-frame');
  if(!frame){
    frame = document.createElement('iframe');
    frame.id = 'print-order-frame';
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
  }
  const doc = frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(()=>{ frame.contentWindow.focus(); frame.contentWindow.print(); }, 250);
}
