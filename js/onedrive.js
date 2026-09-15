// =============================================================
// ONEDRIVE / SHAREPOINT INTEGRATION (Microsoft Graph API + MSAL.js)
// File đính kèm (hợp đồng, hóa đơn...) được upload thẳng vào
// thư viện tài liệu của SharePoint site dùng chung của công ty.
// =============================================================

const MS_CONFIG = {
  clientId: '9fbdc930-0171-4b8a-93b5-01479b67f715',
  tenantId: 'efda045b-e7a0-4c15-8b5e-d9a143a40275',
  siteHostname: 'tuan75insulation.sharepoint.com',
  sitePath: '/sites/T75-CashflowApp',
};
const MS_SCOPES = ['Files.ReadWrite.All', 'Sites.ReadWrite.All'];

const msalInstance = new msal.PublicClientApplication({
  auth: {
    clientId: MS_CONFIG.clientId,
    authority: `https://login.microsoftonline.com/${MS_CONFIG.tenantId}`,
    redirectUri: window.location.origin + window.location.pathname,
  },
  cache: {
    cacheLocation: 'localStorage', // giữ đăng nhập qua các lần mở lại app
    storeAuthStateInCookie: false,
  },
});

let msInitPromise = null;
function msEnsureInit(){
  if(!msInitPromise) msInitPromise = msalInstance.initialize();
  return msInitPromise;
}

let msCachedSiteId = null;

function msGetAccount(){
  const accounts = msalInstance.getAllAccounts();
  return accounts.length ? accounts[0] : null;
}

async function msLogin(){
  await msEnsureInit();
  const result = await msalInstance.loginPopup({ scopes: MS_SCOPES });
  msalInstance.setActiveAccount(result.account);
  return result.account;
}

async function msGetToken(){
  await msEnsureInit();
  let account = msGetAccount();
  if(!account){
    account = await msLogin();
  }
  try{
    const res = await msalInstance.acquireTokenSilent({ scopes: MS_SCOPES, account });
    return res.accessToken;
  }catch(err){
    const res = await msalInstance.acquireTokenPopup({ scopes: MS_SCOPES, account });
    return res.accessToken;
  }
}

async function msGetSiteId(){
  if(msCachedSiteId) return msCachedSiteId;
  const token = await msGetToken();
  const url = `https://graph.microsoft.com/v1.0/sites/${MS_CONFIG.siteHostname}:${MS_CONFIG.sitePath}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if(!res.ok) throw new Error('Không truy cập được SharePoint site (mã lỗi ' + res.status + '). Kiểm tra lại quyền truy cập site.');
  const data = await res.json();
  msCachedSiteId = data.id;
  return msCachedSiteId;
}

/**
 * Upload 1 file lên thư mục chỉ định trong SharePoint site dùng chung — KHÔNG giới hạn dung lượng thực tế
 * (dùng "upload session" của Microsoft Graph cho phép tải file lớn theo từng phần — lên tới hàng chục GB).
 * File nhỏ (<=4MB) vẫn dùng cách tải đơn giản (nhanh hơn, ít lần gọi API hơn).
 * @param {File} file
 * @param {string} folderPath vd: 'Projects/BALTICA'
 * @param {function} onProgress tuỳ chọn — callback(percent) để hiện tiến độ khi file lớn phải tải nhiều phần
 * @returns {Promise<{webUrl:string, name:string, id:string}>}
 */
// Tạo LINK CHIA SẺ chính thức cho file vừa tải lên — bắt buộc phải làm bước này, vì link "webUrl" mặc định
// trả về từ API upload chỉ xem được nếu người bấm vào ĐÃ SẴN CÓ quyền truy cập trực tiếp tới file đó (thường
// chỉ đúng người tải lên) — người khác trong công ty bấm vào dễ bị chặn/không hiện được nội dung.
// scope:'organization' = ai trong công ty (đăng nhập đúng tài khoản Microsoft 365 công ty) cũng xem được,
// không cần được cấp quyền riêng cho từng file.
async function msCreateShareLink(siteId, itemId, token){
  try{
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/createLink`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'view', scope: 'organization' }),
    });
    if(!res.ok) return null;
    const data = await res.json();
    return data.link ? data.link.webUrl : null;
  }catch(e){ return null; }
}

async function msUploadFile(file, folderPath, onProgress){
  if(!file) return null;
  const token = await msGetToken();
  const siteId = await msGetSiteId();
  const safeName = file.name.replace(/[#%&{}\\<>*?/$!'":@+`|=]/g, '_');
  const path = `${folderPath}/${Date.now()}_${safeName}`;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');

  // File nhỏ (<=4MB): PUT thẳng nội dung file trong 1 lần gọi — đúng giới hạn của API "upload đơn giản".
  if(file.size <= 4 * 1024 * 1024){
    const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/content`;
    const buf = await file.arrayBuffer();
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type || 'application/octet-stream' },
      body: buf,
    });
    if(!res.ok){
      const txt = await res.text().catch(()=> '');
      throw new Error('Upload thất bại (mã lỗi ' + res.status + '). ' + txt.slice(0, 200));
    }
    const data = await res.json();
    const shareUrl = await msCreateShareLink(siteId, data.id, token);
    return { webUrl: shareUrl || data.webUrl, name: data.name, id: data.id };
  }

  // File lớn (>4MB): dùng "upload session" — chia file thành từng phần (10MB/phần, đúng bội số 320KB
  // theo yêu cầu của Microsoft Graph), tải lần lượt cho tới khi xong. Hỗ trợ được file rất lớn (nhiều trăm MB).
  const sessionRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/createUploadSession`,
    { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename', name: safeName } }) }
  );
  if(!sessionRes.ok){
    const txt = await sessionRes.text().catch(()=> '');
    throw new Error('Không tạo được phiên tải file lớn (mã lỗi ' + sessionRes.status + '). ' + txt.slice(0, 200));
  }
  const { uploadUrl } = await sessionRes.json();

  const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB mỗi phần — đúng bội số 320KB Microsoft yêu cầu
  const total = file.size;
  let start = 0;
  let lastResultData = null;
  while(start < total){
    const end = Math.min(start + CHUNK_SIZE, total);
    const chunk = file.slice(start, end);
    const chunkBuf = await chunk.arrayBuffer();
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(end - start),
        'Content-Range': `bytes ${start}-${end-1}/${total}`,
      },
      body: chunkBuf,
    });
    if(!putRes.ok && putRes.status !== 202){
      const txt = await putRes.text().catch(()=> '');
      throw new Error('Upload phần file thất bại (mã lỗi ' + putRes.status + '). ' + txt.slice(0, 200));
    }
    if(onProgress) onProgress(Math.round((end/total)*100));
    if(putRes.status !== 202){ lastResultData = await putRes.json().catch(()=>null); } // 200/201 = đã xong hẳn
    start = end;
  }
  if(!lastResultData) throw new Error('Tải file lớn không hoàn tất — thử lại.');
  const shareUrl = await msCreateShareLink(siteId, lastResultData.id, token);
  return { webUrl: shareUrl || lastResultData.webUrl, name: lastResultData.name, id: lastResultData.id };
}

function msIsLoggedIn(){
  return !!msalInstance.getAllAccounts().length;
}

async function msSignOut(){
  await msEnsureInit();
  const account = msGetAccount();
  if(account) await msalInstance.logoutPopup({ account });
}
