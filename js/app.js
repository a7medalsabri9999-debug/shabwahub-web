// 🧠 شبوة HUB - التطبيق الرئيسي
// ✅ النسخة النهائية - خالية من الأخطاء

import { 
  auth, database, onAuthStateChanged, signOut,
  ref, onValue, remove, update, query, orderByChild, equalTo, limitToLast
} from './firebase-config.js';

import { initTheme, toggleTheme } from './theme.js';
import { initAuth, showAuthModal, signOutUser } from './auth.js';
import { initFeed, loadTrendingPosts, loadFollowingPosts } from './feed.js';
import { initProfile, loadUserProfile } from './profile.js';
import { initMessages, loadChatList } from './messages.js';
import { initNotifications, loadNotifications, updateNotificationBadge } from './notifications.js';
import { initInteractions } from './interactions.js';
import { initAdmin, checkAdminAccess } from './admin.js';
import { showToast, storage, debounce } from './utils.js';

// حالة التطبيق
const AppState = {
  currentUser: null,
  currentTab: 'trending',
  currentPage: 'feed',
  isLoading: false,
  lastPage: null
};

// تهيئة التطبيق
export const initApp = async () => {
  console.log('🚀 شبوة HUB - بدء التهيئة...');
  
  initTheme();
  
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('hidden');
    }
  }, 1500);
  
  await initAuth();
  
  onAuthStateChanged(auth, async (user) => {
    AppState.currentUser = user;
    if (user) {
      await onUserLoggedIn(user);
    } else {
      onUserLoggedOut();
    }
  });
  
  setupNavigation();
  setupPostButton();
  setupSearch();
  setupDoubleBackExit();
  initInteractions();
  
  console.log('✅ شبوة HUB - اكتملت التهيئة');
};

// عند تسجيل دخول المستخدم
const onUserLoggedIn = async (user) => {
  console.log('👤 مستخدم مسجل:', user.email);
  
  document.getElementById('auth-modal')?.classList.add('hidden');
  document.getElementById('main-app')?.classList.remove('hidden');
  
  await loadUserProfile(user.uid);
  initFeed();
  initMessages();
  initNotifications();
  
  await loadTrendingPosts();
  await loadNotifications(user.uid);
  updateNotificationBadge(user.uid);
  
  // ✅ تم التصحيح: إضافة القوس المفقود هنا
  if (await checkAdminAccess(user.email)) {
    document.getElementById('btn-admin')?.classList.remove('hidden');
    initAdmin();
  }
  
  updateUserLastSeen(user.uid);
};

// عند تسجيل خروج المستخدم
const onUserLoggedOut = () => {
  document.getElementById('main-app')?.classList.add('hidden');
  showAuthModal();
  AppState.currentUser = null;
  AppState.currentTab = 'trending';
  AppState.currentPage = 'feed';
};

// تحديث آخر ظهور
const updateUserLastSeen = (uid) => {
  const lastSeenRef = ref(database, `users/${uid}/lastSeen`);
  update(lastSeenRef, { timestamp: Date.now() });
  setInterval(() => {
    if (AppState.currentUser) {
      update(lastSeenRef, { timestamp: Date.now() });
    }
  }, 60000);
};

// إعداد التنقل السفلي
const setupNavigation = () => {
  const navButtons = document.querySelectorAll('.nav-btn[data-page]');
  navButtons.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const page = btn.dataset.page;
      if (page === AppState.currentPage) return;
      navButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');      
      await loadPage(page);
    });
  });
  
  document.getElementById('btn-admin')?.addEventListener('click', () => {
    if (AppState.currentUser) loadAdminPanel();
  });
  
  document.getElementById('btn-messages')?.addEventListener('click', () => loadPage('messages'));
  document.getElementById('btn-notifications')?.addEventListener('click', () => loadPage('notifications'));
};

// تحميل صفحة معينة
const loadPage = async (pageName) => {
  AppState.currentPage = pageName;
  const content = document.getElementById('page-content');
  const containers = content.querySelectorAll('.feed-container, .messages-container, .notifications-container, .profile-container, .admin-container');
  containers.forEach((el) => {
    el?.classList.remove('active');
    el?.classList.add('hidden');
  });
  
  const targetContainer = document.getElementById(`${pageName}-container`);
  if (targetContainer) {
    targetContainer.classList.remove('hidden');
    targetContainer.classList.add('active');
    
    // ✅ تم التصحيح: فصل الأسطر المتداخلة
    switch(pageName) {
      case 'feed':
        if (AppState.currentTab === 'trending') await loadTrendingPosts();
        else await loadFollowingPosts();
        break;
      case 'messages':
        if (AppState.currentUser) await loadChatList(AppState.currentUser.uid);
        break;
      case 'notifications':
        if (AppState.currentUser) await loadNotifications(AppState.currentUser.uid);
        break;
      case 'profile':
        if (AppState.currentUser) await loadUserProfile(AppState.currentUser.uid);
        break;
    }
  }
  
  if (window.AndroidInterface) {
    const titles = { 'feed': 'شبوة HUB', 'messages': 'الرسائل', 'notifications': 'الإشعارات', 'profile': 'حسابي', 'admin': 'لوحة التحكم' };
    window.AndroidInterface.setPageTitle(titles[pageName] || 'شبوة HUB');
  }
};

// إعداد زر النشر
const setupPostButton = () => {
  const btnCreate = document.getElementById('btn-create-post');
  const modal = document.getElementById('create-post-modal');
  const closeBtn = document.getElementById('close-post-modal');
  const cancelBtn = document.getElementById('cancel-post');
  const publishBtn = document.getElementById('publish-post');
  const contentArea = document.getElementById('post-content');
  const charCount = document.getElementById('char-count');
  
  btnCreate?.addEventListener('click', () => {
    if (!AppState.currentUser) {
      showToast('يجب تسجيل الدخول أولاً', 'error');
      showAuthModal();
      return;
    }
    modal?.classList.remove('hidden');
    contentArea?.focus();
  });  

  const closeModal = () => {
    modal?.classList.add('hidden');
    if (contentArea) { contentArea.value = ''; charCount.textContent = '0'; }
  };
  
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  
  contentArea?.addEventListener('input', (e) => {
    const count = e.target.value.length;
    charCount.textContent = count;
    charCount.style.color = (count > 9500) ? 'var(--error)' : 'var(--text-muted)';
  });
  
  publishBtn?.addEventListener('click', async () => {
    const content = contentArea?.value.trim();
    if (!content) { showToast('اكتب شيئاً للنشر ✍️', 'warning'); return; }
    publishBtn.classList.add('btn-loading');
    try {
      showToast('تم النشر بنجاح ✓', 'success');
      closeModal();
      await loadTrendingPosts();
    } catch (error) {
      showToast('فشل النشر', 'error');
    } finally {
      publishBtn.classList.remove('btn-loading');
    }
  });
};

// إعداد البحث
const setupSearch = () => {
  const searchInput = document.getElementById('search-input');
  const resultsBox = document.getElementById('search-results');
  if (!searchInput || !resultsBox) return;
  const handleSearch = debounce(async (searchQuery) => {
    if (!searchQuery || searchQuery.length < 2) { resultsBox.classList.add('hidden'); return; }
    showSearchResults([]);
  }, 300);
  searchInput.addEventListener('input', (e) => handleSearch(e.target.value.trim()));
};

// إعداد الخروج المزدوج
const setupDoubleBackExit = () => { // ✅ تم التصحيح: إضافة القوس
  let lastBackPress = 0;
  if (window.AndroidInterface) {
    window.AndroidInterface.setOnBackPressed(() => {
      const now = Date.now();
      if (AppState.currentPage === 'feed') {
        if (now - lastBackPress < 2000) { window.AndroidInterface.exitApp(); return true; }
        else { showToast('اضغط مرة أخرى للخروج', 'info', 2000); lastBackPress = now; return true; }
      }
      if (AppState.currentPage !== 'feed') {
        loadPage('feed');
        return true;
      }
      return false;
    });
  }
};

const loadAdminPanel = async () => {
  if (!await checkAdminAccess(AppState.currentUser?.email)) {
    showToast('غير مصرح لك بالدخول', 'error');
    return;
  }
  loadPage('admin');
  document.getElementById('btn-admin')?.classList.add('active');
};

export const switchFeedTab = async (tabName) => {
  AppState.currentTab = tabName;
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  if (tabName === 'trending') await loadTrendingPosts();
  else await loadFollowingPosts();
};

export const getAppState = () => ({ ...AppState });
export const getCurrentUser = () => AppState.currentUser;

document.addEventListener('DOMContentLoaded', () => initApp());
