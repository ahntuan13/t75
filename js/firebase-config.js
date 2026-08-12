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
const auth = firebase.auth();
const db = firebase.firestore();

// Bật cache offline (giúp app vẫn xem được dữ liệu cũ khi mất mạng)
db.enablePersistence().catch(() => {});
