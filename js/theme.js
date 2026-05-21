// 🎨 شبوة HUB - إدارة الوضع الداكن/الفاتح

import { storage } from './utils.js';

const THEME_KEY = 'shabwahub_theme';

// تهيئة الوضع عند التحميل
export const initTheme = () => {
  const savedTheme = storage.get(THEME_KEY, 'dark');
  applyTheme(savedTheme);
  setupThemeToggle();
};

// تطبيق الوضع
export const applyTheme = (theme) => {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  storage.set(THEME_KEY, theme);
  
  // تحديث لون شريط الحالة في الجوال
  if (window.AndroidInterface) {
    const isDark = theme !== 'light';
    window.AndroidInterface.setStatusBarColor(isDark ? '#0a0a0a' : '#f8f9fa');
  }
};

// الحصول على الوضع الحالي
export const getCurrentTheme = () => {
  return document.documentElement.getAttribute('data-theme') || 'dark';
};

// التبديل بين الأوضاع
export const toggleTheme = () => {
  const current = getCurrentTheme();
  const newTheme = current === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
  return newTheme;
};

// إعداد زر التبديل
export const setupThemeToggle = () => {
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const newTheme = toggleTheme();
      // تحديث أيقونة الزر
      const icon = toggleBtn.querySelector('i');
      if (icon) {
        icon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
      }
    });
  }
};

// الاستماع لتفضيلات النظام
export const listenToSystemTheme = (callback) => {
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      // فقط إذا لم يختر المستخدم وضعاً يدوياً
      if (!storage.get(THEME_KEY)) {
        const newTheme = e.matches ? 'dark' : 'light';
        applyTheme(newTheme);
        if (callback) callback(newTheme);
      }
    });
  }
};

// تصدير الدوال
export default {
  initTheme,
  applyTheme,
  getCurrentTheme,
  toggleTheme,
  setupThemeToggle,
  listenToSystemTheme
};