// =============================================================
// PAYROLL & TIMESHEET MODULE
// =============================================================

let EMPLOYEES = [];
let TIMESHEETS = [];

const WORKTYPE_LABEL = {
  full:'Đủ công', half:'Nửa công', ot:'Tăng ca', leave:'Nghỉ có phép', absent:'Nghỉ không phép'
};
const WORKTYPE_VALUE = { full:1, half:0.5, ot:1, leave:0, absent:0 };

function listenPayroll(){
  db.collection('employees').orderBy('createdAt','desc').onSnapshot((snap)=>{
    EMPLOYEES = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderEmployeesTable();
    fillEmployeeSelects();
    renderPayrollSummary();
  });
  db.collection('timesheets').orderBy('date','desc').onSnapshot((snap)=>{
    TIMESHEETS = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderTimesheetTable();
    renderPayrollSummary();
  });
}

function fillEmployeeSelects(){
  const selectors = ['#ts-filter-employee','#ts-employee'];
  selectors.forEach(sel=>{
    const node = document.querySelector(sel);
    if(!node) return;
    const cur = node.value;
    const withAll = sel==='#ts-filter-employee';
    node.innerHTML = (withAll ? '<option value="">Tất cả nhân viên</option>' : '<option value="">— Chọn nhân viên —</option>')
      + EMPLOYEES.map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
    if(cur) node.value = cur;
  });
}

// ---- Employees CRUD ----
document.getElementById('btn-add-employee').addEventListener('click', ()=>{
  document.getElementById('emp-id').value = '';
  document.getElementById('emp-name').value = '';
  document.getElementById('emp-position').value = '';
  document.getElementById('emp-salary').value = '';
  document.getElementById('emp-note').value = '';
  openModal('modal-employee');
});

document.getElementById('save-emp-btn').addEventListener('click', async ()=>{
  const id = document.getElementById('emp-id').value;
  const name = document.getElementById('emp-name').value.trim();
  if(!name){ toast('Vui lòng nhập họ tên'); return; }
  const data = {
    name,
    position: document.getElementById('emp-position').value.trim(),
    baseSalary: parseMoneyInput(document.getElementById('emp-salary')),
    note: document.getElementById('emp-note').value.trim(),
  };
  try{
    if(id){
      await db.collection('employees').doc(id).update(data);
      toast('Đã cập nhật nhân viên');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('employees').add(data);
      toast('Đã thêm nhân viên');
    }
    closeModal('modal-employee');
  }catch(err){ toast('Lỗi: '+err.message); }
});

function renderEmployeesTable(){
  const table = document.getElementById('employees-table');
  if(!table) return;
  if(EMPLOYEES.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">👥</div>Chưa có nhân viên nào.</div></td></tr>`;
    return;
  }
  table.innerHTML = `<thead><tr><th>Họ tên</th><th>Chức vụ</th><th>Lương cơ bản/tháng</th><th></th></tr></thead><tbody>
    ${EMPLOYEES.map(e=>`<tr>
      <td><strong>${escapeHtml(e.name)}</strong></td>
      <td>${escapeHtml(e.position||'—')}</td>
      <td class="num">${fmtVND(e.baseSalary)}</td>
      <td><div class="row-actions">
        ${isAdmin() ? `<button class="icon-btn" data-edit-emp="${e.id}" title="Sửa">✎</button>
        <button class="icon-btn" data-del-emp="${e.id}" title="Xóa">🗑</button>` : '<span class="helper-text">Chỉ Admin</span>'}
      </div></td>
    </tr>`).join('')}</tbody>`;
}

document.getElementById('employees-table').addEventListener('click', (e)=>{
  const editId = e.target.closest('[data-edit-emp]')?.dataset.editEmp;
  const delId = e.target.closest('[data-del-emp]')?.dataset.delEmp;
  if(editId){
    const emp = EMPLOYEES.find(x=>x.id===editId);
    document.getElementById('emp-id').value = emp.id;
    document.getElementById('emp-name').value = emp.name||'';
    document.getElementById('emp-position').value = emp.position||'';
    setMoneyInputValue(document.getElementById('emp-salary'), emp.baseSalary);
    document.getElementById('emp-note').value = emp.note||'';
    openModal('modal-employee');
  }
  if(delId){
    if(confirmDelete('Xóa nhân viên này? Dữ liệu chấm công cũ sẽ vẫn được giữ.')){
      db.collection('employees').doc(delId).delete().then(()=>toast('Đã xóa nhân viên'));
    }
  }
});

// ---- Timesheet CRUD ----
document.getElementById('btn-add-timesheet').addEventListener('click', ()=>{
  if(EMPLOYEES.length===0){ toast('Vui lòng thêm nhân viên trước'); return; }
  document.getElementById('ts-id').value = '';
  document.getElementById('ts-employee').value = '';
  document.getElementById('ts-date').value = todayISO();
  document.getElementById('ts-worktype').value = 'full';
  document.getElementById('ts-checkin').value = '';
  document.getElementById('ts-checkout').value = '';
  document.getElementById('ts-note').value = '';
  openModal('modal-timesheet');
});

document.getElementById('save-ts-btn').addEventListener('click', async ()=>{
  const id = document.getElementById('ts-id').value;
  const employeeId = document.getElementById('ts-employee').value;
  const date = document.getElementById('ts-date').value;
  if(!employeeId || !date){ toast('Vui lòng chọn nhân viên và ngày'); return; }
  const emp = EMPLOYEES.find(x=>x.id===employeeId);
  const data = {
    employeeId, employeeName: emp ? emp.name : '',
    date,
    workType: document.getElementById('ts-worktype').value,
    checkIn: document.getElementById('ts-checkin').value,
    checkOut: document.getElementById('ts-checkout').value,
    note: document.getElementById('ts-note').value.trim(),
  };
  try{
    if(id){
      await db.collection('timesheets').doc(id).update(data);
      toast('Đã cập nhật chấm công');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = auth.currentUser.email;
      await db.collection('timesheets').add(data);
      toast('Đã lưu chấm công');
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

function renderTimesheetTable(){
  const table = document.getElementById('timesheet-table');
  if(!table) return;
  const rows = getFilteredTimesheets();
  if(rows.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">🗓</div>Chưa có dữ liệu chấm công phù hợp bộ lọc.</div></td></tr>`;
    return;
  }
  table.innerHTML = `<thead><tr><th>Ngày</th><th>Nhân viên</th><th>Loại công</th><th>Giờ vào</th><th>Giờ ra</th><th>Công</th><th>Ghi chú</th><th></th></tr></thead><tbody>
    ${rows.map(t=>`<tr>
      <td>${fmtDate(t.date)}</td>
      <td><strong>${escapeHtml(t.employeeName)}</strong></td>
      <td>${tagForWorkType(t.workType)}</td>
      <td>${t.checkIn||'—'}</td>
      <td>${t.checkOut||'—'}</td>
      <td class="num">${WORKTYPE_VALUE[t.workType] ?? 1}</td>
      <td>${escapeHtml(t.note||'—')}</td>
      <td><div class="row-actions">
        <button class="icon-btn" data-edit-ts="${t.id}" title="Sửa">✎</button>
        ${isAdmin() ? `<button class="icon-btn" data-del-ts="${t.id}" title="Xóa">🗑</button>` : ''}
      </div></td>
    </tr>`).join('')}</tbody>`;
}

function tagForWorkType(type){
  const label = WORKTYPE_LABEL[type] || type;
  if(type==='full' || type==='ot') return `<span class="tag tag-in">${label}</span>`;
  if(type==='half') return `<span class="tag tag-gold">${label}</span>`;
  if(type==='absent') return `<span class="tag tag-out">${label}</span>`;
  return `<span class="tag tag-gray">${label}</span>`;
}

document.getElementById('timesheet-table').addEventListener('click', (e)=>{
  const editId = e.target.closest('[data-edit-ts]')?.dataset.editTs;
  const delId = e.target.closest('[data-del-ts]')?.dataset.delTs;
  if(editId){
    const t = TIMESHEETS.find(x=>x.id===editId);
    document.getElementById('ts-id').value = t.id;
    document.getElementById('ts-employee').value = t.employeeId;
    document.getElementById('ts-date').value = t.date;
    document.getElementById('ts-worktype').value = t.workType;
    document.getElementById('ts-checkin').value = t.checkIn||'';
    document.getElementById('ts-checkout').value = t.checkOut||'';
    document.getElementById('ts-note').value = t.note||'';
    openModal('modal-timesheet');
  }
  if(delId){
    if(confirmDelete('Xóa bản ghi chấm công này?')){
      db.collection('timesheets').doc(delId).delete().then(()=>toast('Đã xóa'));
    }
  }
});

['ts-filter-month','ts-filter-employee'].forEach(id=>{
  document.getElementById(id).addEventListener('change', renderTimesheetTable);
});

// ---- Monthly payroll summary ----
function renderPayrollSummary(){
  const table = document.getElementById('payroll-summary-table');
  if(!table) return;
  const month = document.getElementById('payroll-filter-month').value || todayISO().slice(0,7);
  const rowsForMonth = TIMESHEETS.filter(t=> monthKey(t.date)===month);

  const byEmp = {};
  EMPLOYEES.forEach(e=> byEmp[e.id] = {emp:e, days:0, ot:0, leave:0, absent:0});
  rowsForMonth.forEach(t=>{
    if(!byEmp[t.employeeId]) return;
    const v = WORKTYPE_VALUE[t.workType] ?? 0;
    byEmp[t.employeeId].days += v;
    if(t.workType==='leave') byEmp[t.employeeId].leave += 1;
    if(t.workType==='absent') byEmp[t.employeeId].absent += 1;
  });

  const rows = Object.values(byEmp);
  if(rows.length===0){
    table.innerHTML = `<tr><td><div class="empty-state"><div class="big">👥</div>Chưa có nhân viên để tính lương.</div></td></tr>`;
    return;
  }
  table.innerHTML = `<thead><tr>
    <th>Nhân viên</th><th>Lương cơ bản</th><th>Công chuẩn (26)</th><th>Công thực tế</th><th>Nghỉ phép</th><th>Nghỉ không phép</th><th>Lương thực nhận (ước tính)</th>
  </tr></thead><tbody>
    ${rows.map(r=>{
      const salary = r.emp.baseSalary || 0;
      const estimate = salary ? Math.round(salary/26*r.days) : 0;
      return `<tr>
        <td><strong>${escapeHtml(r.emp.name)}</strong></td>
        <td class="num">${fmtVND(salary)}</td>
        <td class="num">26</td>
        <td class="num"><strong>${r.days}</strong></td>
        <td class="num">${r.leave}</td>
        <td class="num" style="color:${r.absent>0?'var(--red)':'inherit'}">${r.absent}</td>
        <td class="num"><strong>${fmtVND(estimate)}</strong></td>
      </tr>`;
    }).join('')}
  </tbody>`;
}

document.getElementById('payroll-filter-month')?.addEventListener('change', renderPayrollSummary);
document.getElementById('payroll-filter-month').value = todayISO().slice(0,7);
document.getElementById('ts-filter-month').value = todayISO().slice(0,7);
