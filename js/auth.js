// 🔐 شبوة HUB - نظام المصادقة

import { 
  auth, database, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, onAuthStateChanged, updateProfile,
  ref, set, get, child, update
} from './firebase-config.js';

import { showToast, isValidEmail, isStrongPassword, storage } from './utils.js';

const ADMIN_EMAIL = 'hoopoe.myapps@gmail.com';

// تهيئة نظام المصادقة
export const initAuth = () => {
  setupAuthModal();
  setupAuthForms();
  return new Promise((resolve) => setTimeout(resolve, 100));
};

// إعداد نموذج الدخول/التسجيل
const setupAuthModal = () => {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  
  modal.innerHTML = `
    <div class="modal-content auth-content">
      <div class="auth-header">
        <img src="img/logo.png" alt="شبوة HUB" class="auth-logo">
        <h2 class="username gold-text">شبوة <span class="gold-text">HUB</span></h2>
        <p class="auth-welcome">نتشرف بكل العرب 🌟</p>
      </div>
      <form id="login-form" class="auth-form">
        <div class="form-group">
          <label>البريد الإلكتروني</label>
          <input type="email" id="login-email" placeholder="example@email.com" required>
        </div>
        <div class="form-group">
          <label>كلمة المرور</label>
          <input type="password" id="login-password" placeholder="••••••••" required>
        </div>
        <div class="form-options">
          <label class="checkbox-label"><input type="checkbox" id="remember-me"> <span>تذكرني</span></label>
        </div>
        <button type="submit" class="btn btn-primary btn-block">تسجيل الدخول</button>
        <p class="auth-switch">ليس لديك حساب؟ <a href="#" id="show-signup">إنشاء حساب جديد</a></p>
      </form>
      <form id="signup-form" class="auth-form hidden">
        <div class="form-group"><label>الاسم الكامل *</label><input type="text" id="signup-name" placeholder="أحمد صالح" required></div>
        <div class="form-group"><label>اسم المستخدم @ *</label><input type="text" id="signup-username" pattern="^[a-zA-Z0-9_]{3,20}$" required></div>
        <div class="form-group"><label>البريد الإلكتروني *</label><input type="email" id="signup-email" required></div>
        <div class="form-group"><label>كلمة المرور *</label><input type="password" id="signup-password" required></div>
        <div class="form-group"><label>تأكيد كلمة المرور *</label><input type="password" id="signup-confirm" required></div>
        <button type="submit" class="btn btn-primary btn-block">إنشاء الحساب</button>
        <p class="auth-switch">لديك حساب بالفعل؟ <a href="#" id="show-login">تسجيل الدخول</a></p>
      </form>
    </div>
  `;
};

// إعداد أحداث النماذج
const setupAuthForms = () => {
  document.addEventListener('click', (e) => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    if (e.target?.id === 'show-signup') { e.preventDefault(); loginForm?.classList.add('hidden'); signupForm?.classList.remove('hidden'); }
    if (e.target?.id === 'show-login') { e.preventDefault(); signupForm?.classList.add('hidden'); loginForm?.classList.remove('hidden'); }
  });
  
  document.addEventListener('submit', async (e) => {
    if (e.target?.id === 'login-form') { e.preventDefault(); await handleLogin(); }
    if (e.target?.id === 'signup-form') { e.preventDefault(); await handleSignup(); }
  });
};

const handleLogin = async () => {
  const email = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  if (!email || !password) { showToast('أدخل البيانات المطلوبة', 'warning'); return; }
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    await update(ref(database, `users/${userCredential.user.uid}`), { lastLogin: Date.now() });
    showToast('مرحباً بعودتك! 🎉', 'success');
  } catch (error) {
    showToast('فشل تسجيل الدخول', 'error');
  }
};

const handleSignup = async () => {
  const name = document.getElementById('signup-name')?.value.trim();
  const username = document.getElementById('signup-username')?.value.trim().toLowerCase();
  const email = document.getElementById('signup-email')?.value.trim();
  const password = document.getElementById('signup-password')?.value;
  const confirm = document.getElementById('signup-confirm')?.value;
  
  if (!name || !username || !email || !password) { showToast('املأ الحقول المطلوبة', 'warning'); return; }
  if (password !== confirm) { showToast('كلمتا المرور غير متطابقتين', 'error'); return; }
  
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await updateProfile(user, { displayName: name });
    
    await set(ref(database, `users/${user.uid}`), {
      uid: user.uid, name, username, email, role: (email === ADMIN_EMAIL ? 'admin' : 'user'),
      createdAt: Date.now(), isOnline: true
    });
    showToast('تم إنشاء الحساب بنجاح! 🎉', 'success');
  } catch (error) {
    showToast('فشل إنشاء الحساب', 'error');
  }
};

export const signOutUser = async () => {
  if (auth.currentUser) await update(ref(database, `users/${auth.currentUser.uid}`), { isOnline: false });
  await signOut(auth);
  showToast('تم تسجيل الخروج', 'success');
};

export const showAuthModal = () => document.getElementById('auth-modal')?.classList.remove('hidden');
export const checkAdminAccess = async (email) => email === ADMIN_EMAIL;
export const getUserData = async (uid) => (await get(child(ref(database), `users/${uid}`))).val();
export const updateUserData = async (uid, data) => { await update(ref(database, `users/${uid}`), { ...data }); return true; };
export const checkUsernameAvailability = async (username) => !(await get(child(ref(database), `usernames/${username}`))).exists();
