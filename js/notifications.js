// 🔔 شبوة HUB - نظام الإشعارات الذكي

import { 
  database, auth,
  ref, onValue, update, remove, query, orderByChild, limitToLast
} from './firebase-config.js';

import { getCurrentUser } from './app.js';
import { showToast, formatTime } from './utils.js';

// تهيئة نظام الإشعارات
export const initNotifications = () => {
  setupNotificationListeners();
  console.log('✅ Notifications System Initialized');
};

// تحميل الإشعارات
export const loadNotifications = async (userId) => {
  if (!userId) return;
  
  const container = document.getElementById('notifications-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="page-header">
      <h3>الإشعارات</h3>
      <button class="btn btn-sm btn-secondary" onclick="markAllAsRead()">
        <i class="fas fa-check-double"></i> تحديد الكل كمقروء
      </button>
    </div>
    <div id="notifications-list" class="notifications-list">
      <div class="loading-posts"><div class="spinner"></div><p>جاري التحميل...</p></div>
    </div>
  `;
  
  try {
    const notifRef = ref(database, `notifications/${userId}`);
    const snapshot = await new Promise((resolve) => {
      onValue(query(notifRef, orderByChild('timestamp'), limitToLast(50)), 
        (snap) => resolve(snap), () => resolve(null)
      );
    });
    
    const listEl = document.getElementById('notifications-list');
    
    if (!snapshot?.exists()) {
      listEl.innerHTML = '<div class="empty-state"><i class="fas fa-bell-slash"></i><p>لا توجد إشعارات جديدة 🎉</p></div>';
      return;
    }
        const notifications = [];
    snapshot.forEach(child => {
      notifications.push({ id: child.key, ...child.val() });
    });
    
    // ترتيب زمني عكسي
    notifications.sort((a, b) => b.timestamp - a.timestamp);
    
    // عرض الإشعارات
    listEl.innerHTML = '';
    for (const notif of notifications) {
      listEl.insertAdjacentHTML('beforeend', createNotificationItem(notif, userId));
    }
    
    // إضافة أحداث النقر
    listEl.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', () => {
        const notifId = item.dataset.notifId;
        handleNotificationClick(notifId, notif);
      });
    });
    
  } catch (error) {
    console.error('LoadNotifications Error:', error);
    document.getElementById('notifications-list').innerHTML = 
      '<div class="empty-state">فشل تحميل الإشعارات</div>';
  }
};

// إنشاء عنصر إشعار
const createNotificationItem = (notif, userId) => {
  const icons = {
    like: 'fa-heart',
    comment: 'fa-comment',
    reply: 'fa-reply',
    follow: 'fa-user-plus',
    message: 'fa-envelope',
    mention: 'fa-at',
    system: 'fa-bell'
  };
  
  const colors = {
    like: 'var(--error)',
    comment: 'var(--info)',
    follow: 'var(--success)',
    message: 'var(--gold-primary)',
    system: 'var(--text-muted)'
  };
  
  return `    <div class="notification-item ${!notif.read ? 'unread' : ''}" 
         data-notif-id="${notif.id}" 
         data-type="${notif.type}"
         data-post-id="${notif.postId || ''}"
         data-from-user="${notif.fromUserId || ''}">
      
      <img src="${notif.fromUserPhoto || 'img/placeholder-avatar.png'}" 
           class="notification-avatar" alt="${notif.fromUserName}">
      
      <div class="notification-content">
        <p class="notification-text">
          <strong>${notif.fromUserName || 'مستخدم'}</strong> 
          ${notif.text}
        </p>
        
        ${notif.postPreview ? `
          <div class="notification-post-preview">
            ${notif.postPreview.substring(0, 100)}${notif.postPreview.length > 100 ? '...' : ''}
          </div>
        ` : ''}
        
        <span class="notification-time">${formatTime(notif.timestamp)}</span>
      </div>
      
      <i class="fas ${icons[notif.type] || 'fa-bell'}" 
         style="color:${colors[notif.type] || 'var(--text-muted)'};font-size:1.2rem"></i>
    </div>
  `;
};

// معالجة النقر على إشعار
const handleNotificationClick = async (notifId, notif) => {
  // تمييز كمقروء
  const user = getCurrentUser();
  if (user) {
    await update(ref(database, `notifications/${user.uid}/${notifId}`), { read: true });
  }
  
  // الانتقال للمكان المناسب
  if (notif.postId) {
    // الانتقال للمنشور
    const { toggleComments } = await import('./feed.js');
    // سيتم تنفيذ الانتقال هنا
    showToast('جاري الانتقال للمنشور...', 'info');
  } else if (notif.fromUserId && notif.type === 'message') {
    // فتح المحادثة
    const { openChatWindow } = await import('./messages.js');
    openChatWindow(notif.fromUserId);
  } else if (notif.fromUserId) {
    // فتح الملف الشخصي    const { loadUserProfile } = await import('./profile.js');
    loadUserProfile(notif.fromUserId, true);
  }
};

// تحديث شارة الإشعارات في الهيدر
export const updateNotificationBadge = async (userId) => {
  if (!userId) return;
  
  try {
    const notifRef = ref(database, `notifications/${userId}`);
    const snapshot = await new Promise((resolve) => {
      onValue(notifRef, (snap) => resolve(snap), () => resolve(null));
    });
    
    let unreadCount = 0;
    
    if (snapshot?.exists()) {
      snapshot.forEach(child => {
        if (!child.val().read) unreadCount++;
      });
    }
    
    // تحديث الشارات
    const badges = document.querySelectorAll('#notifications-badge, #nav-notif-badge');
    badges.forEach(badge => {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    });
    
  } catch (error) {
    console.error('UpdateNotifBadge Error:', error);
  }
};

// تحديد الكل كمقروء
export const markAllAsRead = async () => {
  const user = getCurrentUser();
  if (!user) return;
  
  try {
    const notifRef = ref(database, `notifications/${user}`);
    const snapshot = await new Promise((resolve) => {
      onValue(notifRef, (snap) => resolve(snap), () => resolve(null));
    });
        if (snapshot?.exists()) {
      const updates = {};
      snapshot.forEach(child => {
        if (!child.val().read) {
          updates[`notifications/${user}/${child.key}/read`] = true;
        }
      });
      await update(ref(database), updates);
    }
    
    showToast('تم تحديد الكل كمقروء ✓', 'success');
    updateNotificationBadge(user.uid);
    
  } catch (error) {
    console.error('MarkAllRead Error:', error);
  }
};

// حذف إشعار
export const deleteNotification = async (notifId) => {
  const user = getCurrentUser();
  if (!user || !confirm('حذف هذا الإشعار؟')) return;
  
  try {
    await remove(ref(database, `notifications/${user.uid}/${notifId}`));
    
    // إزالة من الواجهة
    const el = document.querySelector(`.notification-item[data-notif-id="${notifId}"]`);
    if (el) {
      el.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => el.remove(), 200);
    }
    
    updateNotificationBadge(user.uid);
    
  } catch (error) {
    console.error('DeleteNotification Error:', error);
  }
};

// الاستماع للإشعارات الجديدة في الوقت الفعلي
const setupNotificationListeners = () => {
  const user = getCurrentUser();
  if (!user) return;
  
  const notifRef = ref(database, `notifications/${user.uid}`);
  
  onValue(query(notifRef, orderByChild('timestamp'), limitToLast(1)), (snapshot) => {
    if (!snapshot.exists()) return;
        snapshot.forEach(child => {
      const notif = child.val();
      
      // إذا كان الإشعار جديد وغير مقروء
      if (!notif.read) {
        // عرض إشعار منبثق
        showToast(`🔔 ${notif.fromUserName}: ${notif.text}`, 'info', 5000);
        
        // صوت إشعار (اختياري)
        // playNotificationSound();
        
        // تحديث الشارة
        updateNotificationBadge(user.uid);
      }
    });
  });
};

// تصدير
export default {
  initNotifications,
  loadNotifications,
  updateNotificationBadge,
  markAllAsRead,
  deleteNotification
};

// دوال عالمية
window.ShabwaHub = {
  ...window.ShabwaHub,
  markAllAsRead,
  deleteNotification
};