// 💬 شبوة HUB - نظام التفاعلات: إعجابات، تعليقات، ردود، نسخ، حفظ

import { database, auth, ref, set, update, remove, onValue } from './firebase-config.js';
import { getCurrentUser } from './app.js';
import { showToast, formatTime, sanitizeText } from './utils.js';

// تهيئة نظام التفاعلات
export const initInteractions = () => {
  setupGlobalInteractions();
  console.log('✅ Interactions System Initialized');
};

// إعداد التفاعلات العامة
const setupGlobalInteractions = () => {
  // النقر خارج القوائم لإغلاقها
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-menu') && !e.target.closest('.menu-btn')) {
      document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.add('hidden'));
    }
  });
  
  // منع إغلاق المودال عند النقر على محتواه
  document.querySelectorAll('.modal-content').forEach(modal => {
    modal.addEventListener('click', (e) => e.stopPropagation());
  });
};

// ❤️ تبديل الإعجاب على تعليق
export const likeComment = async (postId, commentId) => {
  const user = getCurrentUser();
  if (!user) {
    showToast('سجل الدخول للتفاعل ❤️', 'warning');
    return;
  }
  
  const likeRef = ref(database, `posts/${postId}/comments/${commentId}/likes/${user.uid}`);
  
  try {
    const exists = await new Promise((resolve) => {
      onValue(likeRef, (snap) => resolve(snap.exists()), () => resolve(false));
    });
    
    if (exists) {
      await remove(likeRef);
    } else {
      await set(likeRef, true);
    }
    
    // تحديث الواجهة
    updateCommentLikesUI(postId, commentId);    
  } catch (error) {
    console.error('LikeComment Error:', error);
  }
};

// تحديث واجهة إعجابات التعليق
const updateCommentLikesUI = (postId, commentId) => {
  const commentEl = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
  if (!commentEl) return;
  
  const btn = commentEl.querySelector('.comment-action:first-child');
  const likesRef = ref(database, `posts/${postId}/comments/${commentId}/likes`);
  
  onValue(likesRef, (snap) => {
    const count = snap.size || 0;
    if (btn) {
      btn.innerHTML = `<i class="fas fa-heart"></i> ${count}`;
    }
  });
};

// ↩️ الرد على تعليق
export const replyToComment = (postId, parentCommentId, parentUserId) => {
  const form = document.getElementById(`reply-form-${parentCommentId}`);
  const input = document.getElementById(`reply-input-${parentCommentId}`);
  
  if (form && input) {
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
      input.focus();
      input.placeholder = `رد على @... `;
    }
  }
};

// إرسال رد
export const submitReply = async (e, postId, parentCommentId, parentUserId) => {
  e.preventDefault();
  const user = getCurrentUser();
  if (!user) return;
  
  const input = document.getElementById(`reply-input-${parentCommentId}`);
  const text = input?.value.trim();
  if (!text) return;
  
  try {
    // الرد هو تعليق عادي مع حقل إضافي
    const newReplyRef = push(ref(database, `posts/${postId}/comments`));
    await set(newReplyRef, {      userId: user.uid,
      userName: user.displayName,
      userPhoto: user.photoURL,
      text: sanitizeText(`@${parentUserId} ${text}`),
      timestamp: Date.now(),
      replyTo: parentCommentId,
      likesCount: 0
    });
    
    // تحديث عداد الردود للتعليق الأصلي
    await update(ref(database, `posts/${postId}/comments/${parentCommentId}`), {
      repliesCount: (await getRepliesCount(postId, parentCommentId)) + 1
    });
    
    // إشعار لصاحب التعليق الأصلي
    if (user.uid !== parentUserId) {
      await createNotification(parentUserId, {
        type: 'reply',
        fromUserId: user.uid,
        fromUserName: user.displayName,
        postId: postId,
        commentId: parentCommentId,
        text: `رد على تعليقك`,
        timestamp: Date.now()
      });
    }
    
    input.value = '';
    document.getElementById(`reply-form-${parentCommentId}`)?.classList.add('hidden');
    await loadComments(postId);
    
    showToast('تم الرد ✓', 'success');
    
  } catch (error) {
    console.error('SubmitReply Error:', error);
    showToast('فشل إرسال الرد', 'error');
  }
};

// حذف تعليق
export const deleteComment = async (postId, commentId) => {
  const user = getCurrentUser();
  if (!user) return;
  
  // التحقق من الصلاحية
  const commentRef = ref(database, `posts/${postId}/comments/${commentId}`);
  const commentData = await new Promise((resolve) => {
    onValue(commentRef, (snap) => resolve(snap.val()), () => resolve(null));
  });
    const postOwner = await new Promise((resolve) => {
    onValue(ref(database, `posts/${postId}/userId`), 
      (snap) => resolve(snap.val()), () => resolve(null)
    );
  });
  
  const canDelete = 
    user.uid === commentData?.userId || 
    user.uid === postOwner || 
    user.role === 'admin' || 
    user.role === 'moderator';
  
  if (!canDelete) {
    showToast('ليس لديك صلاحية الحذف', 'error');
    return;
  }
  
  if (!confirm('حذف هذا التعليق؟')) return;
  
  try {
    await remove(commentRef);
    
    // تحديث العداد
    await update(ref(database, `posts/${postId}`), {
      commentsCount: Math.max(0, (await getCommentsCount(postId)) - 1)
    });
    
    // إزالة من الواجهة
    const el = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
    if (el) {
      el.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => el.remove(), 200);
    }
    
    showToast('تم حذف التعليق ✓', 'success');
    
  } catch (error) {
    console.error('DeleteComment Error:', error);
    showToast('فشل الحذف', 'error');
  }
};

// 🔖 تبديل الحفظ (العلامات المرجعية)
export const toggleBookmark = async (postId) => {
  const user = getCurrentUser();
  if (!user) {
    showToast('سجل الدخول للحفظ 🔖', 'warning');
    return;
  }
    const bookmarksRef = ref(database, `users/${user.uid}/bookmarks`);
  
  try {
    const bookmarks = await new Promise((resolve) => {
      onValue(bookmarksRef, (snap) => resolve(snap.val() || []), () => resolve([]));
    });
    
    const isBookmarked = bookmarks.includes(postId);
    const newBookmarks = isBookmarked 
      ? bookmarks.filter(id => id !== postId)
      : [...bookmarks, postId];
    
    await set(bookmarksRef, newBookmarks);
    
    // تحديث الواجهة
    const btn = document.querySelector(`.post-card[data-post-id="${postId}"] .action-item:last-child`);
    if (btn) {
      btn.classList.toggle('liked', !isBookmarked);
      btn.querySelector('i').className = `fas fa-${!isBookmarked ? 'bookmark' : 'bookmark'}`;
    }
    
    showToast(isBookmarked ? 'تمت الإزالة من المحفوظات' : 'تم الحفظ ✓', 'success');
    
  } catch (error) {
    console.error('ToggleBookmark Error:', error);
  }
};

// 📋 نسخ نص المنشور
export const copyPostText = async (postId) => {
  const contentEl = document.getElementById(`content-${postId}`);
  if (!contentEl) return;
  
  const text = contentEl.textContent.trim();
  
  try {
    await navigator.clipboard.writeText(text);
    showToast('تم نسخ النص ✓', 'success');
  } catch {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('تم نسخ النص ✓', 'success');
  }
};
// إنشاء إشعار
export const createNotification = async (toUserId, notification) => {
  try {
    const newNotifRef = push(ref(database, `notifications/${toUserId}`));
    await set(newNotifRef, {
      ...notification,
      read: false,
      id: newNotifRef.key
    });
  } catch (error) {
    console.error('CreateNotification Error:', error);
  }
};

// إزالة إشعار
export const removeNotification = async (toUserId, fromUserId, postId, type) => {
  try {
    const notificationsRef = ref(database, `notifications/${toUserId}`);
    const snapshot = await new Promise((resolve) => {
      onValue(notificationsRef, (snap) => resolve(snap), () => resolve(null));
    });
    
    if (snapshot?.exists()) {
      snapshot.forEach(child => {
        const notif = child.val();
        if (notif.fromUserId === fromUserId && notif.postId === postId && notif.type === type) {
          remove(child.ref);
        }
      });
    }
  } catch (error) {
    console.error('RemoveNotification Error:', error);
  }
};

// دوال مساعدة
const getCommentsCount = async (postId) => {
  const snapshot = await new Promise((resolve) => {
    onValue(ref(database, `posts/${postId}/comments`), 
      (snap) => resolve(snap.size || 0), () => resolve(0)
    );
  });
  return snapshot;
};

const getRepliesCount = async (postId, commentId) => {
  const snapshot = await new Promise((resolve) => {
    onValue(query(ref(database, `posts/${postId}/comments`), 
      orderByChild('replyTo'), equalTo(commentId)), 
      (snap) => {        let count = 0;
        snap.forEach(() => count++);
        resolve(count);
      }, () => resolve(0)
    );
  });
  return snapshot;
};

// تصدير
export default {
  initInteractions,
  likeComment,
  replyToComment,
  submitReply,
  deleteComment,
  toggleBookmark,
  copyPostText,
  createNotification,
  removeNotification
};