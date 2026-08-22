// =============================================================
// ĐỌC HÓA ĐƠN TỰ ĐỘNG — MIỄN PHÍ (Tesseract.js chạy trong trình duyệt)
// Upload ảnh/PDF hóa đơn -> OCR đọc chữ -> tự dò tìm số HĐ, MST,
// ngân hàng, tổng tiền... bằng luật (regex) -> điền sẵn vào form
// "Nhập giao dịch" để người dùng kiểm tra lại trước khi lưu.
// Không tốn phí, nhưng độ chính xác thấp hơn AI trả phí — luôn cần
// người dùng rà soát lại, đặc biệt với ảnh mờ/nghiêng/có watermark.
// =============================================================

let OCR_SETTINGS = { companyName: '' };

function listenOcrSettings(){
  db.collection('settings').doc('ocr').onSnapshot((snap)=>{
    OCR_SETTINGS = snap.exists ? (snap.data()||{}) : { companyName:'' };
    const nameEl = document.getElementById('ocr-company-name');
    if(nameEl) nameEl.value = OCR_SETTINGS.companyName || '';
  }, (err)=> console.error('ocr settings listen error', err));
}

document.getElementById('save-ocr-settings-btn')?.addEventListener('click', async ()=>{
  const companyName = document.getElementById('ocr-company-name').value.trim();
  try{
    await db.collection('settings').doc('ocr').set({companyName}, {merge:true});
    toast('Đã lưu cài đặt OCR');
  }catch(err){ toast('Lỗi: '+err.message); }
});

// bỏ dấu tiếng Việt để so khớp linh hoạt (chữ hoa/thường, có dấu/không dấu đều khớp được)
function stripDiacritics(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
}

// Chuyển chuỗi số trên hóa đơn thành number — TỰ NHẬN DIỆN định dạng, vì các hóa đơn khác nhau dùng
// ngược quy ước nhau: kiểu VN "435.600,00" (chấm=hàng nghìn, phẩy=thập phân) và kiểu Anh/Mỹ "17,272.73"
// (phẩy=hàng nghìn, chấm=thập phân) đều gặp trong thực tế. Nhận sai sẽ làm rụng mất phần thập phân
// (vd "17,272.73" hiểu nhầm kiểu VN sẽ ra 17 thay vì 17272.73) — đây là lỗi đã thực sự gặp phải.
function parseInvoiceNumber(s){
  if(!s) return 0;
  const str = String(s).replace(/%$/,'').trim();
  if(!/[.,]/.test(str)) return Number(str) || 0;
  const dotCount = (str.match(/\./g) || []).length;
  const commaCount = (str.match(/,/g) || []).length;
  let decimalChar;
  if(dotCount >= 2 && commaCount <= 1) decimalChar = commaCount === 1 ? ',' : null;
  else if(commaCount >= 2 && dotCount <= 1) decimalChar = dotCount === 1 ? '.' : null;
  else if(dotCount === 1 && commaCount === 1) decimalChar = str.lastIndexOf(',') > str.lastIndexOf('.') ? ',' : '.';
  else if(dotCount === 1 && commaCount === 0){
    const trailing = str.length - str.lastIndexOf('.') - 1;
    decimalChar = trailing === 3 ? null : '.'; // đúng 3 số sau dấu -> nhiều khả năng là nhóm hàng nghìn, không phải thập phân
  } else if(commaCount === 1 && dotCount === 0){
    const trailing = str.length - str.lastIndexOf(',') - 1;
    decimalChar = trailing === 3 ? null : ',';
  } else decimalChar = null;

  if(decimalChar === null) return Number(str.replace(/[.,]/g, '')) || 0;
  const thousandChar = decimalChar === ',' ? '.' : ',';
  let cleaned = str.split(thousandChar).join('');
  const idx = cleaned.lastIndexOf(decimalChar);
  cleaned = cleaned.slice(0, idx) + '.' + cleaned.slice(idx + 1);
  return Number(cleaned) || 0;
}

// Chuyển trang đầu tiên của PDF thành ảnh (dataURL) để OCR đọc được — dùng PDF.js. Dùng làm phương án
// DỰ PHÒNG khi PDF không có lớp chữ thật (PDF dạng ảnh scan) — xem pdfExtractRows() bên dưới là cách chính.
async function pdfFirstPageToImage(file){
  if(typeof pdfjsLib === 'undefined') throw new Error('Chưa tải được thư viện đọc PDF, thử lại sau.');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: buf}).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({scale: 2.0}); // scale lớn cho chữ rõ hơn khi OCR
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width; canvas.height = viewport.height;
  await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
  return canvas.toDataURL('image/png');
}

// =============================================================
// CÁCH CHÍNH (chính xác cao) — Hóa đơn điện tử PDF thường có SẴN LỚP CHỮ THẬT (chọn/copy được chữ bằng
// chuột), khác hẳn ảnh chụp cần đoán chữ. Đọc thẳng toạ độ (x,y) của từng chữ trong PDF bằng PDF.js —
// không cần đoán mò qua OCR, độ chính xác gần như tuyệt đối cho các trường có toạ độ rõ ràng.
// Trả về null nếu PDF không có lớp chữ thật (PDF dạng ảnh scan) -> khi đó phải dùng Tesseract OCR như cũ.
// =============================================================
async function pdfExtractRows(file){
  if(typeof pdfjsLib === 'undefined') throw new Error('Chưa tải được thư viện đọc PDF, thử lại sau.');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: buf}).promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const rawItems = content.items.filter(it => it.str && it.str.trim());
  if(rawItems.length < 15) return null; // quá ít chữ -> nhiều khả năng PDF dạng ảnh scan, không có lớp chữ thật

  // Gom các chữ có toạ độ Y gần nhau (chênh lệch nhỏ) thành CÙNG 1 DÒNG THẬT trên trang.
  const rows = [];
  rawItems.forEach(it=>{
    const y = it.transform[5];
    const x = it.transform[4];
    let row = rows.find(r=> Math.abs(r.y - y) <= 2.5);
    if(!row){ row = {y, items: []}; rows.push(row); }
    row.items.push({ text: it.str, x, w: it.width || (it.str.length * 4) });
  });
  rows.sort((a,b)=> b.y - a.y); // PDF: Y càng lớn càng ở TRÊN trang -> sắp giảm dần để đúng thứ tự đọc từ trên xuống
  rows.forEach(r=> r.items.sort((a,b)=> a.x - b.x)); // trong 1 dòng, sắp trái sang phải

  return { rows };
}

// Ghép các dòng (đã tách theo toạ độ) thành 1 chuỗi văn bản thường — dùng cho việc dò các trường đơn lẻ
// (số hóa đơn, ngày, MST, tổng tiền...) bằng luật (regex) giống hệt cách xử lý ảnh OCR, chỉ khác là
// dữ liệu đầu vào ở đây chính xác tuyệt đối (không phải đoán chữ).
function pdfRowsToText(rows){
  return rows.map(r=>{
    let line = '', lastEnd = null;
    r.items.forEach(it=>{
      if(lastEnd!==null && it.x - lastEnd > 8) line += '  ';
      line += it.text;
      lastEnd = it.x + it.w;
    });
    return line;
  }).join('\n');
}

// Trích bảng hàng hóa THEO ĐÚNG CỘT bằng toạ độ X — CHÍNH XÁC HƠN HẲN cách dò theo thứ tự số trong văn bản
// thường (không còn nhầm lẫn số lượng/đơn giá/mã quy cách/biển số xe với nhau nữa, vì mỗi con số đã nằm
// sẵn đúng cột toạ độ X của nó trên trang PDF — không cần đoán qua vị trí xuất hiện trước/sau trong câu).
function parseItemTableByColumns(rows){
  const headerRowIdx = rows.findIndex(r=>{
    const t = r.items.map(i=>i.text).join(' ');
    return /T[êe]n\s*h[àa]ng/i.test(t) && /Đ[ơo]n\s*v[ịi]/i.test(t) && /S[ốôo]\s*l[uư][oợ]ng/i.test(t);
  });
  if(headerRowIdx < 0) return null;
  const headerRow = rows[headerRowIdx];
  const findColX = (re) => headerRow.items.find(i=> re.test(i.text))?.x;
  const colDefs = [
    ['stt', /^(STT|No\.?)$/i],
    ['name', /T[êe]n\s*h[àa]ng/i],
    ['unit', /Đ[ơo]n\s*v[ịi]/i],
    ['qty', /S[ốôo]\s*l[uư][oợ]ng/i],
    ['price', /Đ[ơo]n\s*gi[áa]/i],
    ['amount', /Th[àa]nh\s*ti[ềe]n(?!\s*sau)/i],
    ['vatRate', /Thu[ếe]\s*su[ấa]t/i],
    ['vatAmt', /Ti[ềe]n\s*thu[ếe]/i],
    ['afterTax', /Th[àa]nh\s*ti[ềe]n\s*sau|Amount\)?\s*$/i],
  ];
  const cols = colDefs.map(([k,re])=> [k, findColX(re)]).filter(([k,x])=> x!=null);
  if(cols.length < 4) return null; // không xác định đủ cột chính -> không đáng tin, để hàm gọi tự dùng cách dự phòng
  // Bề rộng cột nhỏ nhất giữa 2 cột liền kề — dùng làm ngưỡng khoảng cách tối đa hợp lý cho 1 cột,
  // tránh gán bừa 1 con số/chữ ở xa tít vào cột gần nhất dù cách quá xa (vd chữ từ dòng "Tổng cộng" lem sang).
  const sortedX = cols.map(([,x])=>x).sort((a,b)=>a-b);
  const minGap = Math.min(...sortedX.slice(1).map((x,i)=> x - sortedX[i])) || 999;
  const maxDist = Math.max(minGap * 0.65, 40);
  const bucketOf = (x) => {
    let best=null, bestDist=Infinity;
    cols.forEach(([k,cx])=>{ const d=Math.abs(x-cx); if(d<bestDist){bestDist=d;best=k;} });
    return bestDist<=maxDist ? best : null;
  };

  const summaryRowIdx = rows.findIndex((r,i)=> i>headerRowIdx &&
    /C[ộô]ng\s*ti[ềe]n\s*h[àa]ng|T[ổôo]ng\s*c[ộô]ng|T[ổôo]ng\s*h[ợo]p/i.test(r.items.map(x=>x.text).join(' ')));
  const dataRows = rows.slice(headerRowIdx+1, summaryRowIdx>=0 ? summaryRowIdx : rows.length);

  // QUAN TRỌNG: xử lý theo DÒNG CHỮ TUẦN TỰ (đã sắp đúng thứ tự trên->dưới, trái->phải), KHÔNG gộp trước
  // thành "hàng" theo toạ độ Y — cách gộp hàng cũ dễ bị lệch dần khi xuống các dòng phía dưới (dòng 1-3
  // đúng nhưng dòng 4 trở đi bị rỗng, tên hàng bị cụt — đúng lỗi thực tế đã gặp). Ranh giới giữa các mục
  // hàng hóa chỉ dựa vào việc gặp đúng 1 số STT mới ở cột đầu tiên — đáng tin hơn nhiều.
  const flatItems = [];
  dataRows.forEach(row=> row.items.forEach(it=> flatItems.push(it)));

  const toNum = parseInvoiceNumber;
  const blankItem = () => ({ name:'', unit:'', qty:0, unitPrice:0, amount:0, vatRate:0, vatAmount:0, amountAfterTax:0 });
  const items = [];
  let cur = null;
  let expectStt = 1; // STT trên hóa đơn luôn tăng dần 1,2,3... dùng để xác nhận đúng là số thứ tự, không phải số khác

  flatItems.forEach(it=>{
    const k = bucketOf(it.x);
    if(!k) return;
    const text = it.text.trim();
    if(!text) return;
    if(k === 'stt' && /^\d{1,3}$/.test(text) && Number(text) === expectStt){
      if(cur) items.push(cur);
      cur = blankItem();
      expectStt++;
      return;
    }
    if(!cur) cur = blankItem();
    if(k === 'name') cur.name = (cur.name ? cur.name + ' ' : '') + text;
    else if(k === 'unit' && !cur.unit) cur.unit = text;
    else if(k === 'qty' && !cur.qty) cur.qty = toNum(text);
    else if(k === 'price' && !cur.unitPrice) cur.unitPrice = toNum(text);
    else if(k === 'amount' && !cur.amount) cur.amount = toNum(text);
    else if(k === 'vatRate' && !cur.vatRate) cur.vatRate = toNum(text);
    else if(k === 'vatAmt' && !cur.vatAmount) cur.vatAmount = toNum(text);
    else if(k === 'afterTax' && !cur.amountAfterTax) cur.amountAfterTax = toNum(text);
  });
  if(cur) items.push(cur);

  const validItems = items.filter(it=> it.name.trim() && (it.amount>0 || it.unitPrice>0));
  if(!validItems.length) return null;
  validItems.forEach(it=>{
    if(!it.qty) it.qty = 1;
    if(!it.amountAfterTax) it.amountAfterTax = it.amount + (it.vatAmount||0);
  });
  return validItems;
}

// Chạy OCR (tiếng Việt + tiếng Anh) trên 1 ảnh, trả về toàn bộ chữ đọc được
async function runOcr(imageSource, onProgress){
  const { data } = await Tesseract.recognize(imageSource, 'vie+eng', {
    logger: (m)=>{
      if(m.status === 'recognizing text' && onProgress) onProgress(Math.round((m.progress||0)*100));
    },
  });
  return data.text || '';
}

// Dò tìm các trường thông tin trong chữ OCR đọc được bằng luật (regex) — best-effort, không chắc chắn 100%.
// LƯU Ý: chữ OCR thật thường bị: mất dấu câu, tách dòng lung tung (nhãn và số liệu có thể nằm ở 2 dòng
// khác nhau do bố cục bảng biểu), nên các luật dưới đây cố tình "khoan dung" — cho phép khoảng cách xa
// và xuống dòng giữa nhãn và giá trị, thay vì chỉ khớp trên cùng 1 dòng liền mạch.
// Luôn trả về "items": mảng ít nhất 1 dòng hàng hóa/dịch vụ (best-effort) để đổ thẳng vào khối nhiều dòng
// của loại giao dịch "🧾 Hóa Đơn" — người dùng luôn cần rà soát/sửa lại, đặc biệt khi hóa đơn có >1 dòng.
function parseInvoiceText(text, companyName){
  const norm = stripDiacritics(text);
  const get = (regex) => { const m = text.match(regex); return m ? m[1].trim() : ''; };
  const toNum = parseInvoiceNumber;

  // Số hóa đơn: chấp nhận nhiều kiểu nhãn khác nhau tùy mẫu hóa đơn (Số/No/Ký hiệu/Mẫu số/mã tra cứu MCQT...)
  const invoiceNumber = get(/S[ốôo]\s*h[óoôo][áa]?\s*[đd][ơo]n[\s\S]{0,30}?([A-Z0-9\-]{4,20})/i)
    || get(/S[ốôo]\s*\(?\s*No\.?\s*\)?[\s\S]{0,40}?(\d{4,10})/i)
    || get(/K[ýy]\s*hi[ệe]u[\s\S]{0,30}?([A-Z0-9\-]{4,20})/i)
    || get(/MCQT[\s:]*([A-Z0-9\-]{6,30})/i)
    || get(/No\.?\s*[:.\-]?[\s\S]{0,20}?(\d{4,10})/i);

  // Ngày xuất hóa đơn: "Ngày DD tháng MM năm YYYY" hoặc DD/MM/YYYY, ưu tiên cụm gần chữ "Ngày"/"Date" trước
  let invoiceDate = '';
  const dm = text.match(/(?:Ng[àa]y|Date|K[ýy]\s*ng[àa]y)[\s\S]{0,25}?(\d{1,2})\s*(?:th[áa]ng|\/|\-)[\s\S]{0,25}?(\d{1,2})\s*(?:n[ăa]m|\/|\-)[\s\S]{0,25}?(\d{4})/i)
    || text.match(/(\d{1,2})\s*th[áa]ng[\s\S]{0,25}?(\d{1,2})\s*n[ăa]m[\s\S]{0,25}?(\d{4})/i)
    || text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(dm){
    invoiceDate = `${dm[3]}-${String(dm[2]).padStart(2,'0')}-${String(dm[1]).padStart(2,'0')}`;
  }

  // Dò tìm vùng bảng hàng hóa (từ dòng tiêu đề cột đến trước phần tổng kết) — TẤT CẢ các bước dò số lượng/
  // đơn giá/thành tiền/thuế bên dưới đều CHỈ tìm trong vùng này, không tìm trên toàn văn bản — tránh lấy nhầm
  // số liệu ở chỗ khác (vd "Ngày...tháng...", địa chỉ "Số 75, đường D4..." đã từng bị nhận nhầm thành ĐVT/SL).
  // Có 2 kiểu mẫu hóa đơn hay gặp, phần tổng kết bắt đầu bằng 1 trong các nhãn sau (lấy mốc gần nhất):
  //  - "Cộng tiền hàng" (kiểu thuế TÍNH CHUNG cho cả hóa đơn, không tách theo từng dòng)
  //  - "Tổng cộng" / "Tổng hợp" (kiểu có cột Thuế suất/Tiền thuế GTGT riêng cho từng dòng)
  const headerIdx = text.search(/T[êe]n\s*h[àa]ng\s*h[óo][áa]|Description/i);
  const congTienHangIdx = text.search(/C[ộô]ng\s*ti[ềe]n\s*h[àa]ng/i);
  const tongCongIdx = text.search(/T[ổôo]ng\s*c[ộô]ng|T[ổôo]ng\s*h[ợo]p/i);
  const summaryIdx = [congTienHangIdx, tongCongIdx].filter(i=>i>=0).sort((a,b)=>a-b)[0] ?? -1;
  const tableText = (headerIdx >= 0 && summaryIdx > headerIdx) ? text.slice(headerIdx, summaryIdx) : '';
  const summaryText = summaryIdx >= 0 ? text.slice(summaryIdx, summaryIdx + 400) : '';

  const sellerTaxCode = get(/M[aã]\s*s[ốôo]\s*thu[ếe][\s\S]{0,40}?(\d{10,14})/i);
  const sellerName = get(/(?:[ĐD]on\s*v[ịi]\s*b[áa]n\s*h[àa]ng|Seller)[^\n:]*:?\s*\n?\s*([^\n]{5,120})/i);
  const bankAccount = get(/S[ốôo]\s*t[àa]i\s*kho[ảa]n[\s\S]{0,40}?(\d{6,20})/i);
  const bankName = get(/Ng[âa]n\s*h[àa]ng\s+([^\n\-,.]{3,60})/i);

  // Nhãn tổng kết theo ĐÚNG tên trên hóa đơn: "Cộng tiền hàng" (tiền hàng trước thuế), "Thuế suất GTGT" +
  // "Tiền thuế GTGT" (thuế áp dụng CHUNG cho cả hóa đơn — kiểu mẫu không tách thuế theo từng dòng), và
  // "Tổng tiền thanh toán" / "Tổng cộng tiền thanh toán" (tổng sau thuế).
  const congTienHang = toNum(get(/C[ộô]ng\s*ti[ềe]n\s*h[àa]ng[\s\S]{0,30}?([\d][\d.,]{2,})/i));
  const grandVatRateFlat = Number(get(/Thu[ếe]\s*su[ấa]t\s*GTGT[\s\S]{0,20}?(\d{1,2}(?:[.,]\d)?)\s*%/i)) || 0;
  const tienThueFlat = toNum(get(/Ti[ềe]n\s*thu[ếe]\s*GTGT[\s\S]{0,30}?([\d][\d.,]{2,})/i));
  const tongTienThanhToanFlat = toNum(get(/T[ổôo]ng\s*(?:c[ộô]ng\s*)?ti[ềe]n\s*thanh\s*to[áa]n[\s\S]{0,30}?([\d][\d.,]{2,})/i));

  // Dòng tổng cuối cùng (đứng sau vùng bảng) — dùng làm phương án dự phòng khi không tách được rõ theo nhãn ở trên.
  const summaryNums = (summaryText.match(/[\d][\d.,]{2,}/g) || []).map(toNum).filter(n=>n>0);
  let grandAmount = congTienHang, grandVat = tienThueFlat, grandTotal = tongTienThanhToanFlat;
  if(!grandTotal && summaryNums.length){
    if(summaryNums.length>=3){ [grandAmount, grandVat, grandTotal] = summaryNums.slice(-3); }
    else if(summaryNums.length===2){ [grandAmount, grandTotal] = summaryNums; grandVat = grandTotal - grandAmount; }
    else if(summaryNums.length===1){ grandTotal = grandAmount = summaryNums[0]; }
  }

  // Tách từng dòng hàng hóa trong vùng bảng — mỗi dòng bắt đầu bằng 1 đoạn CÓ CHỮ (tên hàng hóa), các số xuất
  // hiện ngay sau đó (cùng dòng hoặc (các) dòng kế tiếp) được gán theo ĐÚNG THỨ TỰ CỘT trên hóa đơn:
  // SL -> Đơn giá -> Thành tiền -> Thuế suất(%) -> Tiền thuế GTGT -> Thành tiền sau thuế.
  const KNOWN_UNITS = ['Chuyến','Chuyển','Lot','Tháng','Ngày','Cái','Bộ','M2','M3','M','Kg','Chiếc','Bao','Thùng','Hộp','Tấn','Lít',
    'Đôi','Lon','Dĩa','Phần','Chai','Lạng','Cuộn','Kiện','Con','Quyển','Bịch','Gói','Cây','Người','Ca','Suất','Ổ','Vé'];
  const headerWordsRe = /Đơn vị|Số lượng|Đơn giá|Thành tiền|Thuế suất|Tiền thuế|Description|Unit|Quantity|Tên hàng|STT|No\.|Amount/i;
  const rawLines = tableText.split('\n').map(l=>l.trim()).filter(l=> l && !headerWordsRe.test(l));

  const items = [];
  let cur = null;
  const finalizeCur = () => {
    if(!cur) return;
    const nums = cur._nums;
    const pctIdx = nums.findIndex(n=> /%$/.test(n));
    let qty=1, unitPrice=0, amount=0, vatRate=0, vatAmount=0, amountAfterTax=0;
    if(pctIdx >= 0){
      vatRate = toNum(nums[pctIdx]);
      const before = nums.slice(0, pctIdx).map(toNum).filter(n=>n>0);
      const after = nums.slice(pctIdx+1).map(toNum).filter(n=>n>0);
      if(before.length>=3){ [qty, unitPrice, amount] = before.slice(-3); }
      else if(before.length===2){ [unitPrice, amount] = before; }
      else if(before.length===1){ amount = unitPrice = before[0]; }
      if(after.length>=2){ [vatAmount, amountAfterTax] = after.slice(0,2); }
      else if(after.length===1){ amountAfterTax = after[0]; vatAmount = amountAfterTax - amount; }
    } else {
      const allNums = nums.map(toNum).filter(n=>n>0);
      if(allNums.length>=3){ [qty, unitPrice, amount] = allNums.slice(0,3); }
      else if(allNums.length===2){ [unitPrice, amount] = allNums; }
      else if(allNums.length===1){ amount = unitPrice = allNums[0]; }
    }
    const foundUnit = KNOWN_UNITS.find(u=> new RegExp('(^|\\s)'+u+'(\\s|$)','i').test(cur.raw)) || '';
    items.push({ name: cur.name, unit: foundUnit, qty: qty||1, unitPrice, amount, vatRate, vatAmount, amountAfterTax: amountAfterTax || amount });
  };

  for(const line of rawLines){
    const startsWithStt = /^\d{1,3}[\.\)]?\s/.test(line); // dòng THẬT SỰ bắt đầu 1 mục mới luôn có STT ở đầu
    const stripped = line.replace(/^\d{1,3}[\.\)]?\s+/, ''); // bỏ số thứ tự đầu dòng "1. " / "1) " / "1 "
    const hasLetters = /[a-zA-ZÀ-ỹ]{2,}/.test(stripped);
    // CHỈ lấy số "đứng riêng" (không dính liền chữ, "/" hay "-" ở 2 đầu) — tránh nhận nhầm số bên trong
    // mã tra cứu/mã quy cách/biển số xe xen kẽ chữ+số (vd "01M09KYJAP70...", "028/025/1000MM", "92H-05704").
    const nums = stripped.match(/(?<![A-Za-zÀ-ỹ0-9\/\-])\d[\d.,]*\s*%?(?![A-Za-zÀ-ỹ0-9\/\-])/g) || [];
    const isKnownUnitOnly = KNOWN_UNITS.some(u=> new RegExp('^'+u+'$','i').test(stripped.trim()));
    // Dòng BẮT ĐẦU bằng 1 từ ĐVT quen thuộc (vd "Chuyến 1 142.593 ... 8% ...") -> đây là phần số liệu
    // tiếp nối của dòng mô tả phía trên (OCR bị tách dòng giữa tên hàng hóa và số liệu), không phải hàng mới.
    const startsWithUnit = KNOWN_UNITS.find(u=> new RegExp('^'+u+'\\b','i').test(stripped.trim()));
    if(startsWithUnit && cur){
      cur.raw += ' ' + line;
      cur._nums.push(...nums);
      continue;
    }
    // Chưa đủ 2 số "thật" đứng riêng (1 dòng số liệu thật luôn có ít nhất SL+Thành tiền = 2 số trở lên) và
    // mục hiện tại CHƯA thu được số liệu nào -> nhiều khả năng đây là phần mô tả bị xuống dòng giữa chừng
    // (tên hàng dài, hoặc lẫn biển số xe/mã quy cách) -> nối vào tên, KHÔNG lấy nhầm số lẻ tẻ này làm số liệu.
    if(!startsWithStt && cur && cur._nums.length===0 && nums.length<2){
      if(stripped.trim()) cur.name += ' ' + stripped;
      cur.raw += ' ' + line;
      continue;
    }
    if(hasLetters && !isKnownUnitOnly && nums.length===0){
      finalizeCur();
      cur = { name: stripped, raw: line, _nums: [] };
    } else if(hasLetters && !isKnownUnitOnly && nums.length>0){
      finalizeCur();
      const nameOnly = stripped.replace(/[\d.,%\s]+$/,'').trim() || stripped;
      cur = { name: nameOnly, raw: line, _nums: nums };
    } else if(cur){
      cur.raw += ' ' + line;
      cur._nums.push(...nums);
    }
  }
  finalizeCur();

  // Kiểu hóa đơn KHÔNG tách thuế theo từng dòng (bảng chỉ có Tên/ĐVT/SL/Đơn giá/Thành tiền, không có cột
  // Thuế suất/Tiền thuế riêng) -> mọi dòng sẽ có vatRate=0 sau khi dò ở trên. Trường hợp này áp DUY NHẤT
  // 1 mức thuế suất chung (dò được ở nhãn "Thuế suất GTGT" ngoài bảng) cho tất cả các dòng.
  const noRowHasVat = items.every(it=> !it.vatRate);
  if(noRowHasVat && grandVatRateFlat){
    items.forEach(it=>{
      it.vatRate = grandVatRateFlat;
      it.vatAmount = Math.round(it.amount * grandVatRateFlat / 100);
      it.amountAfterTax = it.amount + it.vatAmount;
    });
  }

  // Không dò được dòng hàng hóa nào (bảng OCR quá lem/mất chữ) -> vẫn trả về ít nhất 1 dòng trống, gán tạm
  // theo số liệu tổng ở "Tổng cộng" để người dùng đỡ phải gõ tay hoàn toàn từ đầu, sau đó tự sửa tên hàng hóa.
  const finalItems = items.length ? items : [{
    name: '', unit: '', qty: 1, unitPrice: grandAmount, amount: grandAmount,
    vatRate: 0, vatAmount: grandVat, amountAfterTax: grandTotal || grandAmount,
  }];

  // Đoán Thu/Chi: xem tên công ty xuất hiện gần cụm "bên mua/buyer" hay "bên bán/seller"
  let direction = 'OUT';
  if(companyName){
    const companyNorm = stripDiacritics(companyName);
    const buyerIdx = norm.search(/nguoi mua hang|buyer|ben mua/);
    const companyIdx = norm.indexOf(companyNorm.split(' ').slice(-2).join(' ')); // khớp theo 2 từ cuối tên công ty cho chắc
    if(buyerIdx >= 0 && companyIdx >= 0 && companyIdx >= buyerIdx){
      direction = 'OUT'; // công ty là bên mua -> mình trả tiền -> Chi
    } else if(companyIdx >= 0 && buyerIdx >= 0 && companyIdx < buyerIdx){
      direction = 'IN'; // công ty xuất hiện trước phần "bên mua" -> khả năng là bên bán -> Thu
    }
  }

  return { invoiceNumber, invoiceDate, sellerTaxCode, sellerName, bankAccount, bankName,
    totalAmount: grandTotal || grandAmount, direction, items: finalItems };
}

async function handleInvoiceUpload(file){
  if(!file) return;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  try{
    let extracted, imageDataUrl = '';

    if(isPdf){
      toast('📄 Đang đọc trực tiếp lớp chữ trong file PDF...');
      const pdfData = await pdfExtractRows(file);
      if(pdfData){
        // CÓ lớp chữ thật trong PDF -> đọc chính xác, KHÔNG cần OCR đoán chữ, rất nhanh.
        const rawText = pdfRowsToText(pdfData.rows);
        extracted = parseInvoiceText(rawText, OCR_SETTINGS.companyName);
        const columnItems = parseItemTableByColumns(pdfData.rows);
        if(columnItems) extracted.items = columnItems; // ưu tiên kết quả đọc theo đúng cột toạ độ, chính xác hơn
        imageDataUrl = await pdfFirstPageToImage(file); // vẫn lưu lại ảnh trang hóa đơn để xem/đối chiếu sau này
      } else {
        // KHÔNG có lớp chữ (PDF dạng ảnh scan) -> đành phải OCR như ảnh chụp thường.
        toast('🔍 File PDF này là dạng ảnh scan (không có lớp chữ) — chuyển sang đọc bằng OCR...');
        imageDataUrl = await pdfFirstPageToImage(file);
        const rawText = await runOcr(imageDataUrl, (pct)=> toast(`🔍 Đang đọc chữ... ${pct}%`));
        if(!rawText.trim()){ toast('Không đọc được chữ nào trong file, thử ảnh rõ hơn.'); return; }
        extracted = parseInvoiceText(rawText, OCR_SETTINGS.companyName);
      }
    } else {
      toast('🔍 Đang đọc hóa đơn bằng OCR (có thể mất 10-30 giây)...');
      imageDataUrl = await compressImageFile(file, 1600, 0.85); // ảnh lớn hơn 1 chút để OCR đọc rõ hơn
      const rawText = await runOcr(imageDataUrl, (pct)=> toast(`🔍 Đang đọc chữ... ${pct}%`));
      if(!rawText.trim()){ toast('Không đọc được chữ nào trong ảnh, thử ảnh rõ hơn.'); return; }
      extracted = parseInvoiceText(rawText, OCR_SETTINGS.companyName);
    }

    const prefill = {
      type: extracted.direction,
      projectId: '',
      date: extracted.invoiceDate || '', // để trống nếu không đọc được ngày trên hóa đơn — KHÔNG tự điền ngày hôm nay
                                          // (trước đây điền sẵn ngày hôm nay khiến người dùng tưởng nhầm là ngày hóa đơn thật)
      content: extracted.sellerName ? `Hóa đơn ${extracted.sellerName}` : 'Hóa đơn (OCR tự động — cần kiểm tra lại)',
      description: '', // để trống theo yêu cầu — không tự điền tên bên bán/MST vào đây nữa
      amount: extracted.totalAmount || 0,
      invoiceNumber: extracted.invoiceNumber || '',
      invoiceDate: extracted.invoiceDate || '',
      invoiceStatus: 'issued',
      bankAccount: extracted.bankAccount || '',
      bankName: extracted.bankName || '',
      invoiceImage: imageDataUrl || '',
      invoiceItems: extracted.items || [],
      note: '', // để trống theo yêu cầu — không dán nguyên văn chữ OCR vào Ghi chú nữa
    };
    openTxModal(null, prefill);
    toast('✅ Đọc xong — kiểm tra KỸ lại thông tin (đặc biệt số tiền, tên hàng hóa, MST) trước khi lưu. Nếu hóa đơn có nhiều dòng hàng hóa, bấm "+ Thêm dòng" để nhập đủ.');
  }catch(err){
    toast('Lỗi đọc hóa đơn');
    alert('Lỗi đọc hóa đơn:\n\n' + err.message);
  }
}

document.getElementById('qc-upload-invoice-pdf')?.addEventListener('click', ()=>{
  closeModal('modal-quickcreate');
});
document.getElementById('ocr-invoice-pdf-input')?.addEventListener('change', (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  handleInvoiceUpload(file);
});
