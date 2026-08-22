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
function parseInvoiceText(text, companyName){
  const norm = stripDiacritics(text);
  const get = (regex) => { const m = text.match(regex); return m ? m[1].trim() : ''; };

  const invoiceNumber = get(/S[ốôo]\s*\(?\s*No\.?\s*\)?[\s\S]{0,40}?(\d{4,10})/i)
    || get(/No\.?\s*[:.\-]?[\s\S]{0,20}?(\d{4,10})/i);

  // Ngày (Date) DD tháng MM năm YYYY — cho phép xuống dòng giữa các phần
  let invoiceDate = '';
  const dm = text.match(/(\d{1,2})\s*th[áa]ng[\s\S]{0,15}?(\d{1,2})\s*n[ăa]m[\s\S]{0,15}?(\d{4})/i)
    || text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(dm){
    invoiceDate = `${dm[3]}-${String(dm[2]).padStart(2,'0')}-${String(dm[1]).padStart(2,'0')}`;
  }

  const sellerTaxCode = get(/M[aã]\s*s[ốôo]\s*thu[ếe][\s\S]{0,40}?(\d{10,14})/i);
  const sellerName = get(/(?:[ĐD]on\s*v[ịi]\s*b[áa]n\s*h[àa]ng|Seller)[^\n:]*:?\s*\n?\s*([^\n]{5,120})/i);
  const bankAccount = get(/S[ốôo]\s*t[àa]i\s*kho[ảa]n[\s\S]{0,40}?(\d{6,20})/i);
  const bankName = get(/Ng[âa]n\s*h[àa]ng\s+([^\n\-,.]{3,60})/i);
  const totalAmountRaw = get(/T[ổôo]ng\s*ti[ềe]n\s*thanh\s*to[áa]n[\s\S]{0,40}?([\d][\d.,]{3,})/i)
    || get(/T[ổôo]ng\s*c[ộô]ng[\s\S]{0,40}?([\d][\d.,]{3,})/i);
  const totalAmount = totalAmountRaw ? Number(totalAmountRaw.replace(/[.,]/g,'')) : 0;

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

  return { invoiceNumber, invoiceDate, sellerTaxCode, sellerName, bankAccount, bankName, totalAmount, direction };
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
      description: [
        extracted.sellerName ? 'Bên bán: ' + extracted.sellerName : '',
        extracted.sellerTaxCode ? 'MST: ' + extracted.sellerTaxCode : '',
      ].filter(Boolean).join(' — '),
      amount: extracted.totalAmount || 0,
      invoiceNumber: extracted.invoiceNumber || '',
      invoiceDate: extracted.invoiceDate || '',
      invoiceStatus: 'issued',
      bankAccount: extracted.bankAccount || '',
      bankName: extracted.bankName || '',
      invoiceImage: imageDataUrl || '',
      // đính kèm toàn bộ chữ OCR đọc được vào Ghi chú để người dùng đối chiếu, tự sửa những gì đọc sai
      note: '📄 Chữ OCR đọc được (để đối chiếu, có thể không chính xác 100%):\n' + rawText.trim().slice(0, 1500),
    };
    openTxModal(null, prefill);
    toast('✅ OCR đọc xong — kiểm tra KỸ lại thông tin (đặc biệt số tiền, MST) trước khi lưu');
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
