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

// Chuyển trang đầu tiên của PDF thành ảnh (dataURL) để OCR đọc được — dùng PDF.js
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
  // Số kiểu VN: dấu "." ngăn cách hàng nghìn, dấu "," là phần thập phân (vd "50,0" = 50; "142.593" = 142593).
  const toNum = (s) => {
    if(!s) return 0;
    let str = String(s).replace(/%$/,'').trim().replace(/\./g,'').replace(',', '.');
    return Number(str) || 0;
  };

  // Số hóa đơn: chấp nhận nhiều kiểu nhãn khác nhau tùy mẫu hóa đơn (Số/No/Ký hiệu/Mẫu số/mã tra cứu MCQT...)
  const invoiceNumber = get(/S[ốôo]\s*h[óoôo][áa]?\s*[đd][ơo]n[\s\S]{0,30}?([A-Z0-9\-]{4,20})/i)
    || get(/S[ốôo]\s*\(?\s*No\.?\s*\)?[\s\S]{0,40}?(\d{4,10})/i)
    || get(/K[ýy]\s*hi[ệe]u[\s\S]{0,30}?([A-Z0-9\-]{4,20})/i)
    || get(/MCQT[\s:]*([A-Z0-9\-]{6,30})/i)
    || get(/No\.?\s*[:.\-]?[\s\S]{0,20}?(\d{4,10})/i);

  // Ngày xuất hóa đơn: "Ngày DD tháng MM năm YYYY" hoặc DD/MM/YYYY, ưu tiên cụm gần chữ "Ngày"/"Date" trước
  let invoiceDate = '';
  const dm = text.match(/(?:Ng[àa]y|Date|K[ýy]\s*ng[àa]y)[\s\S]{0,10}?(\d{1,2})\s*(?:th[áa]ng|\/|\-)[\s\S]{0,10}?(\d{1,2})\s*(?:n[ăa]m|\/|\-)[\s\S]{0,10}?(\d{4})/i)
    || text.match(/(\d{1,2})\s*th[áa]ng[\s\S]{0,15}?(\d{1,2})\s*n[ăa]m[\s\S]{0,15}?(\d{4})/i)
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
  toast('🔍 Đang đọc hóa đơn (OCR miễn phí, có thể mất 10-30 giây)...');
  try{
    let imageDataUrl;
    if(isPdf){
      toast('Đang chuyển trang 1 của PDF thành ảnh...');
      imageDataUrl = await pdfFirstPageToImage(file);
    } else {
      imageDataUrl = await compressImageFile(file, 1600, 0.85); // ảnh lớn hơn 1 chút để OCR đọc rõ hơn
    }

    const rawText = await runOcr(imageDataUrl, (pct)=> toast(`🔍 Đang đọc chữ... ${pct}%`));
    if(!rawText.trim()){
      toast('Không đọc được chữ nào trong ảnh, thử ảnh rõ hơn.');
      return;
    }

    const extracted = parseInvoiceText(rawText, OCR_SETTINGS.companyName);
    const prefill = {
      type: extracted.direction,
      projectId: '',
      date: extracted.invoiceDate || todayISO(),
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
    toast('✅ OCR đọc xong — kiểm tra KỸ lại thông tin (đặc biệt số tiền, tên hàng hóa, MST) trước khi lưu. Nếu hóa đơn có nhiều dòng hàng hóa, bấm "+ Thêm dòng" để nhập đủ.');
  }catch(err){
    toast('Lỗi đọc hóa đơn');
    alert('Lỗi đọc hóa đơn (OCR):\n\n' + err.message);
  }
}

document.getElementById('qc-upload-invoice-image')?.addEventListener('click', ()=>{
  closeModal('modal-quickcreate');
});
document.getElementById('qc-upload-invoice-pdf')?.addEventListener('click', ()=>{
  closeModal('modal-quickcreate');
});
document.getElementById('ocr-invoice-image-input')?.addEventListener('change', (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  handleInvoiceUpload(file);
});
document.getElementById('ocr-invoice-pdf-input')?.addEventListener('change', (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  handleInvoiceUpload(file);
});
