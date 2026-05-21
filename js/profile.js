// 👤 شبوة HUB - نظام الملف الشخصي

import {
  database,
  auth,
  storage,
  ref,
  onValue,
  update,
  set,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  remove,
  push
} from './firebase-config.js';

import { getCurrentUser } from './app.js';

import {
  showToast,
  formatNumber,
  uploadToImgBB,
  sanitizeText
} from './utils.js';

// حالة الملف الشخصي
let profileState = {
  viewingUserId: null,
  isOwnProfile: false,
  currentTab: 'posts'
};

// تهيئة الملف الشخصي
export const initProfile = () => {
  setupProfileTabs();
  setupProfileActions();

  console.log('✅ Profile System Initialized');
};

// تحميل بيانات المستخدم
export const loadUserProfile = async (uid, isViewing = false) => {

  profileState.viewingUserId = uid;

  const currentUser = getCurrentUser();

  profileState.isOwnProfile = currentUser?.uid === uid;

  try {

    const snapshot = await new Promise((resolve) => {

      onValue(
        ref(database, `users/${uid}`),
        (snap) => resolve(snap),
        () => resolve(null),
        { onlyOnce: true }
      );

    });

    if (!snapshot || !snapshot.exists()) {

      showToast('المستخدم غير موجود', 'error');
      return;

    }

    const userData = snapshot.val();

    // مهم جداً
    userData.uid = uid;

    renderProfileHeader(userData, isViewing);

    // تحميل المنشورات افتراضياً
    if (profileState.currentTab === 'posts') {
      await loadUserPosts(uid);
    }

    // تحديث حالة المتابعة
    updateFollowButton(uid, currentUser?.uid);

  } catch (error) {

    console.error('LoadProfile Error:', error);

    showToast('فشل تحميل الملف الشخصي', 'error');

  }

};

// عرض رأس الملف الشخصي
const renderProfileHeader = (user, isViewing) => {

  const container = document.getElementById('profile-container');

  if (!container) return;

  const currentUser = getCurrentUser();

  const isOwn = currentUser?.uid === user.uid;

  const isFollowing = currentUser?.following?.[user.uid];

  container.innerHTML = `
  
    <div class="profile-header">

      <!-- الغلاف -->
      <img
        src="${user.coverURL || 'img/placeholder-cover.png'}"
        class="profile-cover"
        alt="غلاف"
        ${isOwn ? `onclick="ShabwaHub.changeCoverImage()"` : ''}
      >

      <!-- الصورة الشخصية -->
      <div
        class="profile-avatar-wrapper"
        ${isOwn ? `onclick="ShabwaHub.changeAvatar()"` : ''}
      >

        <img
          src="${user.photoURL || 'img/placeholder-avatar.png'}"
          class="profile-avatar"
          alt="${sanitizeText(user.name || 'مستخدم')}"
        >

      </div>

    </div>

    <!-- المعلومات -->
    <div class="profile-info">

      <h1 class="profile-name">

        <span class="username">
          ${sanitizeText(user.name || 'مستخدم')}
        </span>

        ${user.verified ? `
          <i class="fas fa-check-circle verified-badge" title="موثق"></i>
        ` : ''}

        ${user.role === 'moderator' ? `
          <span class="mod-badge" title="مشرف">👮</span>
        ` : ''}

        ${user.role === 'admin' ? `
          <span class="admin-badge" title="مدير">👑</span>
        ` : ''}

      </h1>

      <p class="profile-username">
        @${sanitizeText(user.username || 'unknown')}
      </p>

      ${user.bio ? `
        <p class="profile-bio">
          ${sanitizeText(user.bio)}
        </p>
      ` : ''}

      <!-- الإحصائيات -->
      <div class="profile-stats">

        <div class="stat-item">
          <div class="stat-value username">
            ${formatNumber(user.postsCount || 0)}
          </div>
          <div class="stat-label">منشور</div>
        </div>

        <div class="stat-item">
          <div class="stat-value username">
            ${formatNumber(user.followersCount || 0)}
          </div>
          <div class="stat-label">متابع</div>
        </div>

        <div class="stat-item">
          <div class="stat-value username">
            ${formatNumber(user.likesReceived || 0)}
          </div>
          <div class="stat-label">إعجاب</div>
        </div>

      </div>

      <!-- الأزرار -->
      <div class="profile-actions">

        ${!isOwn ? `

          <button
            class="profile-btn primary"
            id="btn-follow"
            onclick="ShabwaHub.toggleFollow('${user.uid}')"
          >

            <i class="fas ${isFollowing ? 'fa-user-check' : 'fa-user-plus'}"></i>

            ${isFollowing ? 'متابع' : 'متابعة'}

          </button>

          <button
            class="profile-btn secondary"
            onclick="ShabwaHub.openChat('${user.uid}')"
          >
            <i class="fas fa-envelope"></i>
            رسالة
          </button>

        ` : `

          <button
            class="profile-btn secondary"
            onclick="ShabwaHub.editProfile()"
          >
            <i class="fas fa-edit"></i>
            تعديل الملف
          </button>

          <button
            class="profile-btn secondary"
            onclick="ShabwaHub.showBookmarks()"
          >
            <i class="fas fa-bookmark"></i>
            المحفوظات
          </button>

        `}

        ${!isOwn ? `

          <button
            class="profile-btn secondary"
            id="btn-notif-toggle"
            onclick="ShabwaHub.toggleUserNotifications('${user.uid}')"
          >
            <i class="fas fa-bell"></i>
            الإشعارات
          </button>

          <button
            class="profile-btn danger"
            id="btn-block"
            onclick="ShabwaHub.toggleBlock('${user.uid}')"
          >
            <i class="fas fa-ban"></i>

            ${user.blockedBy?.[currentUser?.uid] ? 'فك الحظر' : 'حظر'}

          </button>

        ` : `

          <button
            class="profile-btn danger"
            onclick="ShabwaHub.signOutUser?.()"
          >
            <i class="fas fa-sign-out-alt"></i>
            خروج
          </button>

        `}

        <button
          class="profile-btn secondary"
          onclick="ShabwaHub.shareProfile('${user.uid}')"
        >
          <i class="fas fa-share-alt"></i>
          مشاركة
        </button>

      </div>

    </div>

    <!-- التبويبات -->
    <div class="profile-tabs">

      <button
        class="profile-tab ${profileState.currentTab === 'posts' ? 'active' : ''}"
        data-tab="posts"
        onclick="ShabwaHub.switchProfileTab('posts')"
      >
        <i class="fas fa-newspaper"></i>
        منشوراتي
      </button>

      <button
        class="profile-tab ${profileState.currentTab === 'bookmarks' ? 'active' : ''}"
        data-tab="bookmarks"
        onclick="ShabwaHub.switchProfileTab('bookmarks')"
      >
        <i class="fas fa-bookmark"></i>
        المحفوظات
      </button>

      ${isOwn ? `
        <button
          class="profile-tab"
          data-tab="settings"
          onclick="ShabwaHub.openSettings()"
        >
          <i class="fas fa-cog"></i>
          الإعدادات
        </button>
      ` : ''}

    </div>

    <!-- المحتوى -->
    <div id="profile-content" class="profile-content">

      <div
        id="tab-posts"
        class="tab-content ${profileState.currentTab === 'posts' ? 'active' : ''}"
      >
        <div id="user-posts-list" class="posts-list"></div>
      </div>

      <div
        id="tab-bookmarks"
        class="tab-content hidden"
      >
        <div id="bookmarks-list" class="posts-list"></div>
      </div>

    </div>

  `;

};

// تبديل التبويبات
export const switchProfileTab = async (tabName) => {

  profileState.currentTab = tabName;

  document.querySelectorAll('.profile-tab').forEach((tab) => {

    tab.classList.toggle(
      'active',
      tab.dataset.tab === tabName
    );

  });

  document.querySelectorAll('.tab-content').forEach((content) => {
    content.classList.add('hidden');
  });

  document
    .getElementById(`tab-${tabName}`)
    ?.classList.remove('hidden');

  // تحميل المحتوى
  if (tabName === 'posts' && profileState.viewingUserId) {

    await loadUserPosts(profileState.viewingUserId);

  } else if (tabName === 'bookmarks') {

    await loadBookmarks();

  }

};

// تحميل منشورات المستخدم
const loadUserPosts = async (uid) => {

  const listEl = document.getElementById('user-posts-list');

  if (!listEl) return;

  listEl.innerHTML = `
    <div class="loading-posts">
      <div class="spinner"></div>
      <p>جاري التحميل...</p>
    </div>
  `;

  try {

    const postsRef = ref(database, 'posts');

    const snapshot = await new Promise((resolve) => {

      onValue(

        query(
          postsRef,
          orderByChild('userId'),
          equalTo(uid),
          limitToLast(50)
        ),

        (snap) => resolve(snap),

        () => resolve(null),

        { onlyOnce: true }

      );

    });

    if (!snapshot || !snapshot.exists()) {

      listEl.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>لا توجد منشورات بعد</p>
        </div>
      `;

      return;

    }

    const posts = [];

    snapshot.forEach((child) => {

      posts.push({
        id: child.key,
        ...child.val()
      });

    });

    // ترتيب الأحدث أولاً
    posts.sort((a, b) => b.timestamp - a.timestamp);

    const { renderPostCard, initPostInteractions } = await import('./feed.js');

    listEl.innerHTML = '';

    for (const post of posts) {

      const author = await getUserData(post.userId);

      post.author = author;

      listEl.insertAdjacentHTML(
        'beforeend',
        await renderPostCard(post)
      );

    }

    initPostInteractions();

  } catch (error) {

    console.error('LoadUserPosts Error:', error);

    listEl.innerHTML = `
      <div class="empty-state">
        فشل تحميل المنشورات
      </div>
    `;

  }

};

// تحميل المحفوظات
const loadBookmarks = async () => {

  const user = getCurrentUser();

  const listEl = document.getElementById('bookmarks-list');

  if (!user || !listEl) return;

  listEl.innerHTML = `
    <div class="loading-posts">
      <div class="spinner"></div>
    </div>
  `;

  try {

    const bookmarksRef = ref(
      database,
      `users/${user.uid}/bookmarks`
    );

    const bookmarks = await new Promise((resolve) => {

      onValue(
        bookmarksRef,
        (snap) => resolve(snap.val() || []),
        () => resolve([]),
        { onlyOnce: true }
      );

    });

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {

      listEl.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-bookmark"></i>
          <p>لا توجد محفوظات</p>
        </div>
      `;

      return;

    }

    const { createPostElement, initPostInteractions } = await import('./feed.js');

    listEl.innerHTML = '';

    for (const postId of bookmarks) {

      const postRef = ref(database, `posts/${postId}`);

      const snapshot = await new Promise((resolve) => {

        onValue(
          postRef,
          (snap) => resolve(snap),
          () => resolve(null),
          { onlyOnce: true }
        );

      });

      if (snapshot && snapshot.exists()) {

        const post = {
          id: postId,
          ...snapshot.val()
        };

        post.author = await getUserData(post.userId);

        listEl.insertAdjacentHTML(
          'beforeend',
          await createPostElement(post)
        );

      }

    }

    initPostInteractions();

  } catch (error) {

    console.error('LoadBookmarks Error:', error);

    listEl.innerHTML = `
      <div class="empty-state">
        فشل التحميل
      </div>
    `;

  }

};

// متابعة / إلغاء متابعة
export const toggleFollow = async (targetUid) => {

  const user = getCurrentUser();

  if (!user || user.uid === targetUid) return;

  try {

    const followerRef = ref(
      database,
      `users/${targetUid}/followers/${user.uid}`
    );

    const followingRef = ref(
      database,
      `users/${user.uid}/following/${targetUid}`
    );

    const isFollowing = await new Promise((resolve) => {

      onValue(
        followerRef,
        (snap) => resolve(snap.exists()),
        () => resolve(false),
        { onlyOnce: true }
      );

    });

    if (isFollowing) {

      // إلغاء المتابعة
      await remove(followerRef);
      await remove(followingRef);

      await updateUserCounts(
        targetUid,
        user.uid,
        -1,
        -1
      );

      showToast('تم إلغاء المتابعة', 'info');

    } else {

      // متابعة جديدة
      await set(followerRef, {
        timestamp: Date.now()
      });

      await set(followingRef, {
        timestamp: Date.now()
      });

      await updateUserCounts(
        targetUid,
        user.uid,
        1,
        1
      );

      await createNotification(targetUid, {
        type: 'follow',
        fromUserId: user.uid,
        fromUserName: user.displayName || user.name || 'مستخدم',
        text: 'بدأ متابعتك',
        timestamp: Date.now()
      });

      showToast('تمت المتابعة ✓', 'success');

    }

    updateFollowButton(targetUid, user.uid);

  } catch (error) {

    console.error('ToggleFollow Error:', error);

    showToast('فشل في المتابعة', 'error');

  }

};

// تحديث العدادات
const updateUserCounts = async (
  targetUid,
  followerUid,
  followerDelta,
  followingDelta
) => {

  const updates = {};

  if (followerDelta !== 0) {

    const followersCount =
      (await getUserField(targetUid, 'followersCount') || 0)
      + followerDelta;

    updates[`users/${targetUid}/followersCount`] =
      Math.max(0, followersCount);

  }

  if (followingDelta !== 0) {

    const followingCount =
      (await getUserField(followerUid, 'followingCount') || 0)
      + followingDelta;

    updates[`users/${followerUid}/followingCount`] =
      Math.max(0, followingCount);

  }

  await update(ref(database), updates);

};

// تحديث زر المتابعة
const updateFollowButton = (targetUid, currentUid) => {

  if (!currentUid || currentUid === targetUid) return;

  const btn = document.getElementById('btn-follow');

  if (!btn) return;

  const followingRef = ref(
    database,
    `users/${currentUid}/following/${targetUid}`
  );

  onValue(followingRef, (snap) => {

    const isFollowing = snap.exists();

    btn.innerHTML = `
      <i class="fas ${isFollowing ? 'fa-user-check' : 'fa-user-plus'}"></i>
      ${isFollowing ? 'متابع' : 'متابعة'}
    `;

  });

};

// حظر مستخدم
export const toggleBlock = async (targetUid) => {

  const user = getCurrentUser();

  if (!user) return;

  const blockedRef = ref(
    database,
    `users/${targetUid}/blockedBy/${user.uid}`
  );

  try {

    const isBlocked = await new Promise((resolve) => {

      onValue(
        blockedRef,
        (snap) => resolve(snap.exists()),
        () => resolve(false),
        { onlyOnce: true }
      );

    });

    if (isBlocked) {

      await remove(blockedRef);

      showToast('تم فك الحظر', 'success');

    } else {

      await set(blockedRef, {
        timestamp: Date.now()
      });

      showToast('تم حظر المستخدم ✓', 'success');

    }

  } catch (error) {

    console.error('ToggleBlock Error:', error);

  }

};

// تغيير الصورة الشخصية
export const changeAvatar = async () => {

  if (!confirm('تغيير الصورة الشخصية؟')) return;

  if (window.AndroidInterface) {

    window.AndroidInterface.pickImage('avatar');

  } else {

    const input = document.createElement('input');

    input.type = 'file';

    input.accept = 'image/*';

    input.onchange = async (e) => {

      await uploadProfileImage(
        e.target.files[0],
        'avatar'
      );

    };

    input.click();

  }

};

// تغيير صورة الغلاف
export const changeCoverImage = async () => {

  if (!confirm('تغيير صورة الغلاف؟')) return;

  if (window.AndroidInterface) {

    window.AndroidInterface.pickImage('cover');

  } else {

    const input = document.createElement('input');

    input.type = 'file';

    input.accept = 'image/*';

    input.onchange = async (e) => {

      await uploadProfileImage(
        e.target.files[0],
        'cover'
      );

    };

    input.click();

  }

};

// رفع الصور
const uploadProfileImage = async (file, type) => {

  if (!file) return;

  try {

    showToast('جاري الرفع...', 'info');

    const url = await uploadToImgBB(file);

    const user = getCurrentUser();

    if (!user) return;

    const field =
      type === 'avatar'
        ? 'photoURL'
        : 'coverURL';

    await update(
      ref(database, `users/${user.uid}`),
      {
        [field]: url,
        updatedAt: Date.now()
      }
    );

    // تحديث الواجهة
    if (type === 'avatar') {

      const avatar =
        document.querySelector('.profile-avatar');

      if (avatar) avatar.src = url;

    } else {

      const cover =
        document.querySelector('.profile-cover');

      if (cover) cover.src = url;

    }

    showToast('تم تحديث الصورة ✓', 'success');

  } catch (error) {

    console.error('UploadImage Error:', error);

    showToast('فشل رفع الصورة', 'error');

  }

};

// جلب بيانات مستخدم
const getUserData = async (uid) => {

  return await new Promise((resolve) => {

    onValue(
      ref(database, `users/${uid}`),
      (snap) => resolve(snap.val()),
      () => resolve(null),
      { onlyOnce: true }
    );

  });

};

// جلب حقل
const getUserField = async (uid, field) => {

  return await new Promise((resolve) => {

    onValue(
      ref(database, `users/${uid}/${field}`),
      (snap) => resolve(snap.val()),
      () => resolve(null),
      { onlyOnce: true }
    );

  });

};

// إنشاء إشعار
const createNotification = async (
  toUserId,
  notification
) => {

  try {

    const newRef = push(
      ref(database, `notifications/${toUserId}`)
    );

    await set(newRef, {
      ...notification,
      read: false,
      id: newRef.key
    });

  } catch (e) {

    console.error(e);

  }

};

// إعداد التبويبات
const setupProfileTabs = () => {
  // التبويبات تعمل عبر onclick
};

// إعداد الأزرار
const setupProfileActions = () => {
  // الأزرار تعمل عبر onclick
};

// تعديل الملف
export const editProfile = () => {

  showToast(
    'قريباً: تعديل الملف الشخصي 🔧',
    'info'
  );

};

// الإعدادات
export const openSettings = () => {

  showToast(
    'قريباً: صفحة الإعدادات ⚙️',
    'info'
  );

};

// عرض المحفوظات
export const showBookmarks = () => {

  switchProfileTab('bookmarks');

};

// مشاركة الملف
export const shareProfile = async (uid) => {

  const url =
    `${window.location.origin}/user/${uid}`;

  try {

    if (navigator.share) {

      await navigator.share({
        title: 'ملفي على شبوة HUB',
        url
      });

    } else {

      await navigator.clipboard.writeText(url);

      showToast('تم نسخ الرابط ✓', 'success');

    }

  } catch (e) {

    try {

      await navigator.clipboard.writeText(url);

      showToast('تم نسخ الرابط ✓', 'success');

    } catch (err) {

      console.error(err);

    }

  }

};

// فتح المحادثة
export const openChat = async (userId) => {

  try {

    const { openChatWindow } =
      await import('./messages.js');

    openChatWindow(userId);

  } catch (error) {

    console.error(error);

  }

};

// إشعارات المستخدم
export const toggleUserNotifications = async (targetUid) => {

  const user = getCurrentUser();

  if (!user) return;

  const notifRef = ref(
    database,
    `users/${user.uid}/notifyAbout/${targetUid}`
  );

  try {

    const isEnabled = await new Promise((resolve) => {

      onValue(
        notifRef,
        (snap) => resolve(snap.exists()),
        () => resolve(false),
        { onlyOnce: true }
      );

    });

    if (isEnabled) {

      await remove(notifRef);

      showToast(
        'تم إيقاف إشعارات هذا المستخدم',
        'info'
      );

    } else {

      await set(notifRef, true);

      showToast(
        'تم تفعيل الإشعارات ✓',
        'success'
      );

    }

  } catch (error) {

    console.error('ToggleUserNotif Error:', error);

  }

};

// التصدير الافتراضي
export default {

  initProfile,
  loadUserProfile,
  switchProfileTab,
  toggleFollow,
  toggleBlock,
  changeAvatar,
  changeCoverImage,
  editProfile,
  openSettings,
  showBookmarks,
  shareProfile,
  openChat,
  toggleUserNotifications

};

// ربط الدوال عالمياً
window.ShabwaHub = {

  ...window.ShabwaHub,

  loadUserProfile,
  editProfile,
  changeAvatar,
  changeCoverImage,
  toggleFollow,
  toggleBlock,
  switchProfileTab,
  showBookmarks,
  shareProfile,
  openChat,
  toggleUserNotifications

};