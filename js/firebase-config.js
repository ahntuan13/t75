// =============================================================
// THAY CÁC GIÁ TRỊ BÊN DƯỚI BẰNG CONFIG CỦA BẠN
// (Lấy tại: Firebase Console > Project settings > Your apps > SDK setup and configuration)
// =============================================================
const firebaseConfig = {
  apiKey: "AIzaSyDFYPyMCWAZRV2elba2QGeo4JoYOMq4djU",
  authDomain: "kythuattuan75.firebaseapp.com",
  projectId: "kythuattuan75",
  storageBucket: "kythuattuan75.firebasestorage.app",
  messagingSenderId: "619121798840",
  appId: "1:619121798840:web:d03c20559089031d6e8e4d"
};

firebase.initializeApp(firebaseConfig);

// =============================================================
// FIREBASE APP CHECK — chặn truy cập trái phép vào Firestore/Auth
// (chỉ cho phép request đến TỪ ĐÚNG app web này, chặn script/bot gọi thẳng bằng API key lấy được)
// -------------------------------------------------------------
// CÁCH BẬT (làm 2 bước, xem hướng dẫn chi tiết mình đã gửi):
// 1) Lấy "reCAPTCHA v3 site key" (Google reCAPTCHA Admin Console) + đăng ký App Check
//    cho app này trong Firebase Console > Build > App Check.
// 2) Dán site key đó thay cho chữ "DÁN_SITE_KEY_VÀO_ĐÂY" bên dưới, rồi bỏ dấu // ở 2 dòng activate().
// Trước khi dán key thật, đoạn này không làm gì cả (an toàn, không ảnh hưởng app đang chạy).
// =============================================================
const appCheck = firebase.appCheck();
appCheck.activate('6Le5kZEtAAAAAIAvYdxYMwIpjaXpjm5vGUlmFc_Y', true);

const auth = firebase.auth();
const db = firebase.firestore();

// Bật cache offline (giúp app vẫn xem được dữ liệu cũ khi mất mạng)
db.enablePersistence().catch(() => {});
