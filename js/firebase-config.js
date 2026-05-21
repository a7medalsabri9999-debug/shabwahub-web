// ⚙️ شبوة HUB - إعدادات فايربيس
// 📦 الإصدار: 12.13.0

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js";
import { 
  getDatabase, ref, set, push, onValue, remove, update, 
  query, orderByChild, equalTo, limitToLast, child, get
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  signOut, onAuthStateChanged, updateProfile 
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { 
  getStorage, ref as storageRef, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAP3C7TYpVKUihy9Rbkvy140lR-X4irwS0",
  authDomain: "shabwahub-77f64.firebaseapp.com",
  databaseURL: "https://shabwahub-77f64-default-rtdb.firebaseio.com",
  projectId: "shabwahub-77f64",
  storageBucket: "shabwahub-77f64.firebasestorage.app",
  messagingSenderId: "602450191751",
  appId: "1:602450191751:web:16d1516e6e319202491f22",
  measurementId: "G-QZBB8SY26Q"
};

// تهيئة فايربيس
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const database = getDatabase(app);
const auth = getAuth(app);
const storage = getStorage(app);

// تصدير العناصر للاستخدام في الملفات الأخرى
export { 
  app, database, auth, storage, analytics,
  ref, set, push, onValue, remove, update, query, orderByChild, equalTo, limitToLast, child, get,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile,
  storageRef, uploadBytes, getDownloadURL
};

// دالة مساعدة للتحقق من الأدمن
export const isAdmin = (userEmail) => {
  return userEmail === 'hoopoe.myapps@gmail.com';
};

// دالة لتوليد معرف فريد
export const generateUID = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
};

// دالة لتنسيق الوقت
export const formatTimestamp = (timestamp) => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  if (days < 7) return `منذ ${days} يوم`;
  return new Date(timestamp).toLocaleDateString('ar-EG');
};