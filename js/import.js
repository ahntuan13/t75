// =============================================================
// IMPORT THU / CHI TỪ FILE EXCEL
// Cấu trúc cột kỳ vọng (giống file mẫu >CASHFLOW của công ty):
// DỰ ÁN | THỜI GIAN | CODE | NỘI DUNG | DIỄN GIẢI | ĐVT | SL |
// ĐƠN GIÁ (SAU VAT) | THÀNH TIỀN | THÔNG TIN CHUYỂN KHOẢN | HÓA ĐƠN | GHI CHÚ
// =============================================================

const IMPORT_HEADER_ALIASES = {
  project:     ['DU AN', 'PROJECT'],
  date:        ['THOI GIAN', 'NGAY', 'DATE'],
  code:        ['CODE', 'MA'],
  content:     ['NOI DUNG', 'CONTENT'],
  description: ['DIEN GIAI', 'DESCRIPTION'],
  unit:        ['DVT', 'DON VI', 'UNIT'],
  qty:         ['SL', 'SO LUONG', 'QTY'],
  unitPrice:   ['DON GIA'],
  amount:      ['THANH TIEN', 'SO TIEN', 'AMOUNT'],
  transferInfo:['CHUYEN KHOAN'],
  invoiceInfo: ['HOA DON'],
  note:        ['GHI CHU', 'NOTE'],
};

function normalizeHeaderText(s){
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Chuẩn hóa tên dự án trong Excel để so khớp với dự án đã có trong app
// (bỏ tiền tố CASHFLOW_, khoảng trắng, gạch dưới...)
function normalizeProjectKey(s){
  return String(s || '')
    .replace(/^CASHFLOW[_\s-]*/i, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function matchProjectByExcelName(rawName){
  const key = normalizeProjectKey(rawName);
  if(!key) return null;
  return PROJECTS.find(p => normalizeProjectKey(p.name) === key) || null;
}

// Chuyển giá trị ngày từ Excel (Date object, số serial, hoặc chuỗi) sang 'YYYY-MM-DD'
function excelValueToISODate(v){
  if(!v) return '';
  if(v instanceof Date && !isNaN(v)) {
    // QUAN TRỌNG: dùng UTC getters (không phải local getters) vì thư viện đọc Excel (SheetJS)
    // luôn dựng đối tượng Date theo mốc 00:00 UTC của đúng ngày trong file Excel.
    // Nếu đọc lại bằng giờ địa phương (local) sẽ bị lệch mất 1 ngày tùy theo múi giờ máy đang chạy.
    const y = v.getUTCFullYear(), m = String(v.getUTCMonth()+1).padStart(2,'0'), d = String(v.getUTCDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  if(typeof v === 'number'){
    // Excel serial date (epoch 1899-12-30) — cũng quy đổi ra mốc UTC để đồng nhất với nhánh trên
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if(!isNaN(d)) return excelValueToISODate(d);
  }
  if(typeof v === 'string'){
    const s = v.trim();
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // dd/mm/yyyy
    if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/); // yyyy-mm-dd
    if(m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  }
  return '';
}

function toNumber(v){
  if(v === null || v === undefined || v === '') return 0;
  if(typeof v === 'number') return Math.round(v);
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

// Tìm dòng header (chứa cột "DỰ ÁN") trong vài dòng đầu của sheet
function findHeaderRowAndMap(sheet, range){
  for(let r = range.s.r; r <= Math.min(range.s.r + 8, range.e.r); r++){
    const colMap = {};
    let hasProjectCol = false;
    for(let c = range.s.c; c <= Math.min(range.s.c + 60, range.e.c); c++){
      const cellRef = XLSX.utils.encode_cell({r, c});
      const cell = sheet[cellRef];
      if(!cell || cell.v === undefined || cell.v === null || cell.v === '') continue;
      const norm = normalizeHeaderText(cell.v);
      for(const field in IMPORT_HEADER_ALIASES){
        if(colMap[field] !== undefined) continue;
        if(IMPORT_HEADER_ALIASES[field].some(alias => norm.includes(alias))){
          colMap[field] = c;
          if(field === 'project') hasProjectCol = true;
        }
      }
    }
    if(hasProjectCol && colMap.date !== undefined && colMap.amount !== undefined){
      return {headerRow: r, colMap};
    }
  }
  return null;
}

function parseImportWorkbook(workbook){
  // dùng sheet đầu tiên có chứa cột DỰ ÁN, mặc định lấy sheet đầu tiên
  let sheetName = workbook.SheetNames.find(n => /CASHFLOW/i.test(n)) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const found = findHeaderRowAndMap(sheet, range);
  if(!found){
    throw new Error('Không tìm thấy dòng tiêu đề (cần có cột "DỰ ÁN", "THỜI GIAN", "THÀNH TIỀN") trong file.');
  }
  const { headerRow, colMap } = found;
  const getCell = (r, c) => {
    if(c === undefined) return undefined;
    const ref = XLSX.utils.encode_cell({r, c});
    const cell = sheet[ref];
    return cell ? cell.v : undefined;
  };

  const results = [];
  let emptyStreak = 0;
  for(let r = headerRow + 1; r <= range.e.r; r++){
    const projectRaw = getCell(r, colMap.project);
    const amountRaw = getCell(r, colMap.amount);
    const dateRaw = getCell(r, colMap.date);
    const contentRaw = getCell(r, colMap.content);

    // chỉ bỏ qua dòng rác kiểu "Name" / "Content.ColumnX" do export power query để lại,
    // hoặc dòng trống hoàn toàn không có bất kỳ dữ liệu nào
    const projectStr = String(projectRaw || '').trim();
    const isJunkRow = /^Content\./i.test(projectStr) || /^Name$/i.test(projectStr);
    const hasAnyData = (projectStr && !isJunkRow) || amountRaw !== undefined || dateRaw !== undefined || (contentRaw !== undefined && String(contentRaw).trim() !== '');

    if(!hasAnyData){
      emptyStreak++;
      if(emptyStreak > 40) break; // hết dữ liệu thật sự
      continue;
    }
    emptyStreak = 0;

    // up hết mọi dòng có dữ liệu, phần nào thiếu thì để trống — không lọc bỏ
    results.push({
      rowIndex: r + 1,
      projectRaw: projectStr,
      date: excelValueToISODate(dateRaw),
      code: String(getCell(r, colMap.code) || '').trim(),
      content: String(contentRaw || '').trim(),
      description: String(getCell(r, colMap.description) || '').trim(),
      unit: String(getCell(r, colMap.unit) || '').trim(),
      qty: toNumber(getCell(r, colMap.qty)),
      unitPrice: toNumber(getCell(r, colMap.unitPrice)),
      amount: toNumber(amountRaw),
      transferInfo: getCell(r, colMap.transferInfo),
      invoiceInfo: getCell(r, colMap.invoiceInfo),
      note: getCell(r, colMap.note),
    });
  }
  return results;
}

function buildNoteFromExtras(row){
  const parts = [];
  const isMeaningful = (v) => v !== undefined && v !== null && v !== '' && v !== 0 && String(v).trim() !== '0';
  if(isMeaningful(row.transferInfo)) parts.push('CK: ' + String(row.transferInfo).trim());
  if(isMeaningful(row.invoiceInfo)) parts.push('HĐ: ' + String(row.invoiceInfo).trim());
  if(isMeaningful(row.note)) parts.push(String(row.note).trim());
  return parts.join(' | ');
}

async function runImport(file, type){
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

  // Up hết toàn bộ dòng đọc được — không lọc bỏ, phần nào thiếu (ngày/tiền/dự án) để trống.
  // Khớp dự án nếu có thể, không khớp được thì vẫn nhập, chỉ để trống dự án (nhóm "Không thuộc dự án").
  const parsedList = rows.map(row => ({ row, proj: matchProjectByExcelName(row.projectRaw) }));
  const unmatchedProjects = new Set(parsedList.filter(x=>!x.proj && x.row.projectRaw).map(x=>x.row.projectRaw));

  // Dữ liệu Excel đã upload trước đó (cùng loại Thu/Chi) sẽ bị XÓA và thay bằng dữ liệu mới lần này.
  // Xóa ở CẢ 2 nơi vì dòng không khớp dự án có thể đã từng vào Thu Chi (bug cũ) hoặc Chi phí gián tiếp (đúng).
  const oldImportedTx = TRANSACTIONS.filter(t => t.type===type && t.importedFromExcel===true);
  const oldImportedFc = (typeof FIXEDCOSTS!=='undefined'?FIXEDCOSTS:[]).filter(t => t.type===type && t.importedFromExcel===true);

  const typeLabel = type === 'IN' ? 'THU' : 'CHI';
  let summary = `Đọc được ${rows.length} dòng trong file "${file.name}".\n\n`
    + `⚠️ Toàn bộ ${oldImportedTx.length + oldImportedFc.length} giao dịch loại ${typeLabel} đã nhập từ Excel TRƯỚC ĐÓ (cả Thu Chi lẫn Chi phí gián tiếp) sẽ bị XÓA.\n`
    + `✅ Sau đó sẽ nhập mới toàn bộ ${rows.length} dòng — dòng nào KHỚP được dự án sẽ vào Thu Chi, dòng nào KHÔNG khớp/không có dự án sẽ tự động vào Chi phí gián tiếp (mã INDIRECT).\n`;
  if(unmatchedProjects.size) summary += `⚠️ Có ${unmatchedProjects.size} tên dự án không khớp được với dự án đã có, các dòng đó sẽ vào mục Chi phí gián tiếp:\n   - ${[...unmatchedProjects].slice(0,10).join('\n   - ')}${unmatchedProjects.size>10?'\n   ... và nhiều hơn nữa':''}\n`;
  summary += `\nGiao dịch bạn tự tay nhập thủ công (không qua Upload Excel) sẽ KHÔNG bị ảnh hưởng.\n\nBạn có chắc chắn muốn tiếp tục?`;

  if(!confirm(summary)) return;

  try{
    const CHUNK = 400;
    // Bước 1: xóa toàn bộ dữ liệu Excel cũ (cùng loại), cả 2 nơi
    const toDelete = [
      ...oldImportedTx.map(t=>({coll:'transactions', id:t.id})),
      ...oldImportedFc.map(t=>({coll:'fixedCosts', id:t.id})),
    ];
    if(toDelete.length){
      toast(`Đang xóa ${toDelete.length} giao dịch cũ...`);
      for(let i = 0; i < toDelete.length; i += CHUNK){
        const batch = db.batch();
        toDelete.slice(i, i+CHUNK).forEach(x=> batch.delete(db.collection(x.coll).doc(x.id)));
        await batch.commit();
      }
    }
    // Bước 2: nhập toàn bộ dữ liệu mới — dòng có dự án khớp -> Thu Chi; dòng KHÔNG có dự án -> Chi phí gián tiếp
    toast(`Đang nhập ${rows.length} giao dịch mới...`);
    for(let i = 0; i < parsedList.length; i += CHUNK){
      const batch = db.batch();
      parsedList.slice(i, i+CHUNK).forEach(({row, proj})=>{
        const targetCollection = proj ? 'transactions' : 'fixedCosts';
        const ref = db.collection(targetCollection).doc();
        batch.set(ref, {
          type,
          projectId: proj ? proj.id : '',
          projectName: proj ? proj.name : '',
          date: row.date,
          code: row.code || (proj ? '' : 'INDIRECT'),
          content: row.content || '(Không có nội dung)',
          description: row.description,
          unit: row.unit,
          qty: row.qty,
          unitPrice: row.unitPrice,
          amount: row.amount,
          invoiceNumber: '',
          invoiceDate: '',
          bankName: '',
          bankAccount: '',
          bankHolder: '',
          transferDate: '',
          note: buildNoteFromExtras(row),
          invoiceImage: '',
          transferImage: '',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: auth.currentUser.email,
          importedFromExcel: true,
        });
      });
      await batch.commit();
    }
    toast(`✅ Đã thay mới ${rows.length} giao dịch ${typeLabel} từ file Excel`);
  }catch(err){
    alert('Lỗi khi ghi dữ liệu: ' + err.message);
  }
}

document.getElementById('btn-upload-thu').addEventListener('click', ()=>{
  document.getElementById('upload-thu-input').click();
});
document.getElementById('btn-upload-chi').addEventListener('click', ()=>{
  document.getElementById('upload-chi-input').click();
});
document.getElementById('upload-thu-input').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  await runImport(file, 'IN');
});
document.getElementById('upload-chi-input').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  await runImport(file, 'OUT');
});

// ---------------- Xuất Excel (theo đúng bộ lọc đang áp dụng ở bảng Thu Chi) ----------------
document.getElementById('btn-export-tx').addEventListener('click', ()=>{
  const rows = getFilteredTx();
  if(rows.length === 0){ toast('Không có giao dịch nào phù hợp bộ lọc để xuất'); return; }

  const sorted = rows.slice().sort((a,b)=>{
    const pc = (a.projectName||'').localeCompare(b.projectName||'', 'vi');
    if(pc !== 0) return pc;
    return (a.date||'').localeCompare(b.date||'');
  });

  const data = sorted.map(t => ({
    'Dự án': t.projectName || '',
    'Loại': t.type === 'IN' ? 'Thu' : 'Chi',
    'Ngày': t.date || '',
    'Mã': t.code || '',
    'Nội dung': t.content || '',
    'Diễn giải': t.description || '',
    'ĐVT': t.unit || '',
    'SL': t.qty || 0,
    'Đơn giá': t.unitPrice || 0,
    'Thành tiền': t.amount || 0,
    'Trạng thái hóa đơn': (t.invoiceStatus||'pending')==='issued' ? 'Đã xuất' : 'Chưa xuất',
    'Số hóa đơn': t.invoiceNumber || '',
    'Ngày hóa đơn': t.invoiceDate || '',
    [t.type==='IN' ? 'Trạng thái nhận tiền' : 'Trạng thái CK']: (t.transferStatus||'pending')==='done' ? (t.type==='IN'?'Đã nhận':'Đã CK') : (t.type==='IN'?'Chưa nhận':'Chưa CK'),
    'Ngân hàng': t.bankName || '',
    'Số TK': t.bankAccount || '',
    'Chủ TK': t.bankHolder || '',
    'Ngày CK': t.transferDate || '',
    'Trạng thái duyệt chi': t.type==='OUT' ? (t.approvalStatus==='approved' ? 'Đã duyệt' : t.approvalStatus==='rejected' ? 'Từ chối' : t.approvalStatus==='pending' ? 'Chờ duyệt' : '') : '',
    'Ghi chú': t.note || '',
    'Nhập từ Excel': t.importedFromExcel ? 'Có' : '',
    'Người tạo': t.createdBy || '',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    {wch:18},{wch:6},{wch:11},{wch:6},{wch:30},{wch:30},{wch:8},{wch:8},{wch:14},{wch:14},
    {wch:16},{wch:14},{wch:12},{wch:16},{wch:14},{wch:16},{wch:18},{wch:12},{wch:16},{wch:16},{wch:30},{wch:10},{wch:22}
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ThuChi');
  const stamp = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `ThuChi_XuatFile_${stamp}.xlsx`);
  toast(`Đã xuất ${rows.length} giao dịch ra file Excel`);
});
