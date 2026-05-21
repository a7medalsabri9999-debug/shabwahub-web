// 👥 شبوة HUB - نظام المتابعة وإدارة العلاقات الاجتماعية

import { 
  database, auth,
  ref, onValue, set, update, remove, push, query, orderByChild, equalTo, limitToLast
} from './firebase-config.js';

import { formatTime, formatNumber, showToast } from './utils.js';
import { getCurrentUser } from './app.js';

// ثوابت النظام
const FOLLOW_CONFIG = {
  MAX_FOLLOWERS: 10000,      // حد أقصى للمتابعة (لمنع السبام)
  NOTIFICATION_ON_FOLLOW: true, // إرسال إشعار عند المتابعة
  UPDATE_COUNTS_REALTIME: true  // تحديث العدادات فورياً
};

// حالة النظام
let followState = {
  loadingUsers: false,
  currentView: null,
  lastLoaded: null
};

// 🔄 تهيئة نظام المتابعة
export const initFollowSystem = () => {
  setupFollowButtons();
  console.log('✅ Follow System Initialized');
};

// ⚙️ إعداد أزرار المتابعة في الصفحة
const setupFollowButtons = () => {
  // تفويض الأحداث للأزرار الديناميكية
  document.addEventListener('click', (e) => {
    const followBtn = e.target.closest('[data-action="toggle-follow"]');
    if (followBtn) {
      e.preventDefault();
      const targetUid = followBtn.dataset.targetUid;
      if (targetUid) {
        toggleFollow(targetUid, followBtn);
      }
    }
  });
};

// 🎯 التبديل بين متابعة/إلغاء متابعة
export const toggleFollow = async (targetUid, btnElement = null) => {
  const currentUser = getCurrentUser();
  
  if (!currentUser) {    showToast('سجل الدخول لمتابعة المستخدمين ✨', 'warning');
    return false;
  }
  
  if (currentUser.uid === targetUid) {
    showToast('لا يمكنك متابعة نفسك 😊', 'info');
    return false;
  }
  
  // حالة التحميل للزر
  if (btnElement) {
    btnElement.disabled = true;
    btnElement.classList.add('loading');
  }
  
  try {
    const followerRef = ref(database, `users/${targetUid}/followers/${currentUser.uid}`);
    const followingRef = ref(database, `users/${currentUser.uid}/following/${targetUid}`);
    
    // التحقق من الحالة الحالية
    const isFollowing = await new Promise((resolve) => {
      onValue(followerRef, (snap) => resolve(snap.exists()), () => resolve(false));
    });
    
    if (isFollowing) {
      // ❌ إلغاء المتابعة
      await remove(followerRef);
      await remove(followingRef);
      
      // تحديث العدادات
      await updateUserCounts(targetUid, currentUser.uid, -1, -1);
      
      // تحديث الواجهة
      if (btnElement) updateFollowButtonUI(btnElement, false);
      updateUserStatsUI(targetUid, 'followers', -1);
      updateUserStatsUI(currentUser.uid, 'following', -1);
      
      showToast('تم إلغاء المتابعة', 'info');
      return false;
      
    } else {
      // ✅ متابعة جديدة
      const followData = {
        timestamp: Date.now(),
        source: 'app'
      };
      
      await set(followerRef, followData);
      await set(followingRef, followData);
            // تحديث العدادات
      await updateUserCounts(targetUid, currentUser.uid, 1, 1);
      
      // تحديث الواجهة
      if (btnElement) updateFollowButtonUI(btnElement, true);
      updateUserStatsUI(targetUid, 'followers', 1);
      updateUserStatsUI(currentUser.uid, 'following', 1);
      
      // إشعار للمستخدم المتابَع
      if (FOLLOW_CONFIG.NOTIFICATION_ON_FOLLOW) {
        await createFollowNotification(targetUid, currentUser);
      }
      
      showToast('تمت المتابعة ✓ 🎉', 'success');
      return true;
    }
    
  } catch (error) {
    console.error('ToggleFollow Error:', error);
    showToast('فشل في تحديث المتابعة، حاول مرة أخرى', 'error');
    return false;
  } finally {
    if (btnElement) {
      btnElement.disabled = false;
      btnElement.classList.remove('loading');
    }
  }
};

// 🎨 تحديث واجهة زر المتابعة
export const updateFollowButtonUI = (btn, isFollowing) => {
  if (!btn) return;
  
  if (isFollowing) {
    // حالة: متابع
    btn.innerHTML = '<i class="fas fa-user-check"></i> متابع';
    btn.classList.add('following');
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');
  } else {
    // حالة: غير متابع
    btn.innerHTML = '<i class="fas fa-user-plus"></i> متابعة';
    btn.classList.remove('following');
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');
  }
};

// 📊 تحديث عدادات المتابعة في الواجهة
export const updateUserStatsUI = (uid, statType, delta) => {  // البحث عن جميع العناصر التي تعرض إحصائيات هذا المستخدم
  const selectors = {
    'followers': `[data-user-id="${uid}"] .stat-followers .stat-value`,
    'following': `[data-user-id="${uid}"] .stat-following .stat-value`,
    'posts': `[data-user-id="${uid}"] .stat-posts .stat-value`
  };
  
  const elements = document.querySelectorAll(selectors[statType]);
  
  elements.forEach(el => {
    const current = parseInt(el.textContent.replace(/[^0-9]/g, '')) || 0;
    const newValue = Math.max(0, current + delta);
    el.textContent = formatNumber(newValue);
    
    // تأثير وميض للتحديث
    el.style.transition = 'color 0.2s ease';
    el.style.color = 'var(--gold-primary)';
    setTimeout(() => {
      el.style.color = '';
    }, 500);
  });
};

// 🔢 تحديث عدادات المتابعة في قاعدة البيانات
const updateUserCounts = async (targetUid, followerUid, followerDelta, followingDelta) => {
  const updates = {};
  
  if (followerDelta !== 0) {
    updates[`users/${targetUid}/followersCount`] = (await getUserField(targetUid, 'followersCount') || 0) + followerDelta;
  }
  if (followingDelta !== 0) {
    updates[`users/${followerUid}/followingCount`] = (await getUserField(followerUid, 'followingCount') || 0) + followingDelta;
  }
  
  if (Object.keys(updates).length > 0) {
    await update(ref(database), updates);
  }
};

// 🔔 إنشاء إشعار متابعة
const createFollowNotification = async (targetUid, follower) => {
  try {
    const newNotifRef = push(ref(database, `notifications/${targetUid}`));
    await set(newNotifRef, {
      id: newNotifRef.key,
      type: 'follow',
      fromUserId: follower.uid,
      fromUserName: follower.displayName,
      fromUserPhoto: follower.photoURL,
      fromUserVerified: follower.verified || false,      text: 'بدأ متابعتك',
      timestamp: Date.now(),
      read: false,
      actionUrl: `/profile/${follower.uid}`
    });
  } catch (error) {
    console.error('CreateFollowNotification Error:', error);
  }
};

// ✅ التحقق مما إذا كان المستخدم يتابع آخر
export const isFollowing = async (viewerUid, targetUid) => {
  if (!viewerUid || !targetUid) return false;
  
  return new Promise((resolve) => {
    const ref = database ? ref(database, `users/${targetUid}/followers/${viewerUid}`) : null;
    if (ref) {
      onValue(ref, (snap) => resolve(snap.exists()), () => resolve(false));
    } else {
      resolve(false);
    }
  });
};

// 📋 جلب قائمة المتابعين لمستخدم
export const getFollowers = async (uid, limit = 20) => {
  if (!uid) return [];
  
  try {
    const followersRef = ref(database, `users/${uid}/followers`);
    const snapshot = await new Promise((resolve) => {
      onValue(query(followersRef, limitToLast(limit)), 
        (snap) => resolve(snap), () => resolve(null)
      );
    });
    
    if (!snapshot?.exists()) return [];
    
    const followers = [];
    
    // جلب بيانات كل متابع
    for (const [followerUid] of Object.entries(snapshot.val())) {
      const userData = await getUserData(followerUid);
      if (userData) {
        followers.push({
          uid: followerUid,
          ...userData,
          followedAt: snapshot.val()[followerUid]?.timestamp
        });
      }    }
    
    // ترتيب حسب الأحدث
    return followers.sort((a, b) => (b.followedAt || 0) - (a.followedAt || 0));
    
  } catch (error) {
    console.error('GetFollowers Error:', error);
    return [];
  }
};

// 📋 جلب قائمة الذين يتابعهم المستخدم
export const getFollowing = async (uid, limit = 20) => {
  if (!uid) return [];
  
  try {
    const followingRef = ref(database, `users/${uid}/following`);
    const snapshot = await new Promise((resolve) => {
      onValue(query(followingRef, limitToLast(limit)), 
        (snap) => resolve(snap), () => resolve(null)
      );
    });
    
    if (!snapshot?.exists()) return [];
    
    const following = [];
    
    // جلب بيانات كل مستخدم متابَع
    for (const [followingUid] of Object.entries(snapshot.val())) {
      const userData = await getUserData(followingUid);
      if (userData) {
        following.push({
          uid: followingUid,
          ...userData,
          followedAt: snapshot.val()[followingUid]?.timestamp
        });
      }
    }
    
    // ترتيب حسب الأحدث
    return following.sort((a, b) => (b.followedAt || 0) - (a.followedAt || 0));
    
  } catch (error) {
    console.error('GetFollowing Error:', error);
    return [];
  }
};

// 👥 عرض قائمة المتابعين/المتابَعين في مودال
export const showFollowList = async (uid, type = 'followers') => {  const modal = document.getElementById('follow-list-modal');
  if (!modal) return;
  
  // إظهار المودال مع حالة التحميل
  modal.classList.remove('hidden');
  modal.querySelector('.modal-body').innerHTML = `
    <div class="loading-posts">
      <div class="spinner"></div>
      <p>جاري تحميل ${type === 'followers' ? 'المتابعين' : 'المتابَعين'}...</p>
    </div>
  `;
  
  try {
    const list = type === 'followers' 
      ? await getFollowers(uid) 
      : await getFollowing(uid);
    
    renderFollowList(list, type, modal);
    
  } catch (error) {
    console.error('ShowFollowList Error:', error);
    modal.querySelector('.modal-body').innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle"></i>
        <p>فشل تحميل القائمة</p>
      </div>
    `;
  }
};

// 🎨 عرض قائمة المتابعين في المودال
const renderFollowList = (users, type, modal) => {
  const container = modal.querySelector('.modal-body');
  
  if (!users || users.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-users-slash"></i>
        <p>لا يوجد ${type === 'followers' ? 'متابعين' : 'متابَعين'} بعد</p>
      </div>
    `;
    return;
  }
  
  const currentUser = getCurrentUser();
  
  container.innerHTML = `
    <div class="follow-list-header">
      <h4>${type === 'followers' ? 'المتابعين' : 'المتابَعين'} (${users.length})</h4>
      <button class="modal-close-btn" onclick="document.getElementById('follow-list-modal').classList.add('hidden')">&times;</button>    </div>
    <div class="follow-list-items">
      ${users.map(user => `
        <div class="follow-list-item" data-uid="${user.uid}">
          <img src="${user.photoURL || 'img/placeholder-avatar.png'}" 
               class="follow-avatar" 
               alt="${user.name}"
               onclick="window.ShabwaHub.loadUserProfile('${user.uid}')">
          <div class="follow-info">
            <div class="follow-name username">
              ${user.name}
              ${user.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''}
            </div>
            <div class="follow-username">@${user.username}</div>
            ${user.bio ? `<div class="follow-bio">${sanitizeText(user.bio.substring(0, 50))}${user.bio.length > 50 ? '...' : ''}</div>` : ''}
          </div>
          ${currentUser?.uid !== user.uid ? `
            <button class="follow-action-btn ${user.isFollowing ? 'following' : ''}" 
                    data-action="toggle-follow" 
                    data-target-uid="${user.uid}">
              ${user.isFollowing ? '<i class="fas fa-user-check"></i>' : '<i class="fas fa-user-plus"></i>'}
              ${user.isFollowing ? 'متابع' : 'متابعة'}
            </button>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;
  
  // إعادة تهيئة أزرار المتابعة في القائمة
  setupFollowButtons();
};

// 🔍 البحث عن مستخدمين لمتابعتهم
export const searchUsersForFollow = async (query, excludeUid = null) => {
  if (!query || query.length < 2) return [];
  
  try {
    const usersRef = ref(database, 'users');
    const snapshot = await new Promise((resolve) => {
      onValue(usersRef, (snap) => resolve(snap), () => resolve(null));
    });
    
    if (!snapshot?.exists()) return [];
    
    const results = [];
    const normalizedQuery = query.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '');
    
    snapshot.forEach(child => {
      const user = { uid: child.key, ...child.val() };      
      // استبعاد المستخدم الحالي والمستخدم المستبعد
      if (user.uid === excludeUid) return;
      
      // بحث ضبابي في الاسم واسم المستخدم
      const normalizedName = user.name?.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '') || '';
      const normalizedUsername = user.username?.toLowerCase() || '';
      
      if (normalizedName.includes(normalizedQuery) || normalizedUsername.includes(normalizedQuery)) {
        results.push(user);
      }
    });
    
    return results.slice(0, 20); // حد أقصى للنتائج
    
  } catch (error) {
    console.error('SearchUsersForFollow Error:', error);
    return [];
  }
};

// 📊 اقتراح مستخدمين للمتابعة (خوارزمية بسيطة)
export const getSuggestedUsers = async (currentUid, limit = 10) => {
  try {
    // جلب المستخدمين الذين يتابعهم أصدقاؤك (أصدقاء الأصدقاء)
    const followingRef = ref(database, `users/${currentUid}/following`);
    const followingSnap = await new Promise((resolve) => {
      onValue(followingRef, (snap) => resolve(snap), () => resolve(null));
    });
    
    if (!followingSnap?.exists()) {
      // إذا لم يتابع أحد، نرجع مستخدمين عشوائيين موثقين
      return await getRandomVerifiedUsers(limit);
    }
    
    const followingIds = Object.keys(followingSnap.val());
    const suggestions = new Map();
    
    // لكل شخص تتابعه، اجلب من يتابعونه
    for (const uid of followingIds.slice(0, 10)) { // نحدد لـ 10 لتجنب الحمل
      const theirFollowingRef = ref(database, `users/${uid}/following`);
      const theirFollowingSnap = await new Promise((resolve) => {
        onValue(theirFollowingRef, (snap) => resolve(snap), () => resolve(null));
      });
      
      if (theirFollowingSnap?.exists()) {
        Object.keys(theirFollowingSnap.val()).forEach(followedUid => {
          // لا نضيف نفسك، ولا من تتابعهم بالفعل
          if (followedUid !== currentUid && !followingIds.includes(followedUid)) {
            suggestions.set(followedUid, (suggestions.get(followedUid) || 0) + 1);          }
        });
      }
    }
    
    // ترتيب حسب عدد الظهور (الأكثر شيوعاً أولاً)
    const sorted = Array.from(suggestions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([uid]) => uid);
    
    // جلب بيانات المستخدمين المقترحين
    const results = [];
    for (const uid of sorted) {
      const userData = await getUserData(uid);
      if (userData) {
        results.push(userData);
      }
    }
    
    return results;
    
  } catch (error) {
    console.error('GetSuggestedUsers Error:', error);
    return await getRandomVerifiedUsers(limit);
  }
};

// 🎲 جلب مستخدمين عشوائيين موثقين (Fallback)
const getRandomVerifiedUsers = async (limit) => {
  try {
    const usersRef = ref(database, 'users');
    const snapshot = await new Promise((resolve) => {
      onValue(usersRef, (snap) => resolve(snap), () => resolve(null));
    });
    
    if (!snapshot?.exists()) return [];
    
    const verified = [];
    snapshot.forEach(child => {
      const user = child.val();
      if (user.verified) {
        verified.push({ uid: child.key, ...user });
      }
    });
    
    // خلط عشوائي وأخذ العدد المطلوب
    return verified
      .sort(() => Math.random() - 0.5)
      .slice(0, limit);    
  } catch {
    return [];
  }
};

// 📈 تحديث حالة "متصل الآن" للمستخدم
export const updateUserOnlineStatus = (uid, isOnline = true) => {
  if (!uid) return;
  
  const updates = {
    [`users/${uid}/isOnline`]: isOnline,
    [`users/${uid}/lastSeen`]: Date.now()
  };
  
  update(ref(database), updates).catch(console.error);
};

// 🔄 الاستماع لتغيرات حالة المتابعة في الوقت الفعلي
export const listenToFollowChanges = (targetUid, callback) => {
  const currentUser = getCurrentUser();
  if (!currentUser) return () => {};
  
  const ref = database ? ref(database, `users/${targetUid}/followers/${currentUser.uid}`) : null;
  if (!ref) return () => {};
  
  return onValue(ref, (snap) => {
    callback(snap.exists());
  });
};

// 🧹 دوال مساعدة
const getUserData = async (uid) => {
  return new Promise((resolve) => {
    const userRef = ref(database, `users/${uid}`);
    onValue(userRef, (snap) => resolve(snap.val()), () => resolve(null));
  });
};

const getUserField = async (uid, field) => {
  return new Promise((resolve) => {
    const fieldRef = ref(database, `users/${uid}/${field}`);
    onValue(fieldRef, (snap) => resolve(snap.val()), () => resolve(null));
  });
};

const sanitizeText = (text) => {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
};

// 🌍 دوال عالمية للواجهة (متاحة لـ index.html)
window.ShabwaHub = {
  ...window.ShabwaHub,
  
  // تبديل المتابعة
  toggleFollow: (targetUid, btn) => toggleFollow(targetUid, btn),
  
  // عرض قائمة المتابعين
  showFollowers: (uid) => showFollowList(uid, 'followers'),
  
  // عرض قائمة المتابَعين
  showFollowing: (uid) => showFollowList(uid, 'following'),
  
  // البحث عن مستخدمين
  searchUsers: (query) => searchUsersForFollow(query),
  
  // التحقق من حالة المتابعة
  checkFollowing: (targetUid) => isFollowing(getCurrentUser()?.uid, targetUid),
  
  // تحديث زر المتابعة
  updateFollowBtn: (btn, isFollowing) => updateFollowButtonUI(btn, isFollowing)
};

// 🎯 تصدير الدوال للاستخدام في الوحدات الأخرى
export default {
  initFollowSystem,
  toggleFollow,
  isFollowing,
  getFollowers,
  getFollowing,
  showFollowList,
  searchUsersForFollow,
  getSuggestedUsers,
  updateUserOnlineStatus,
  listenToFollowChanges,
  updateFollowButtonUI,
  updateUserStatsUI,
  FOLLOW_CONFIG
};

console.log('✅ ShabwaHub Follow System Loaded');