// ✉️ شبوة HUB - نظام المراسلة الخاص

import {
  database,
  ref,
  onValue,
  push,
  set,
  update,
  query,
  orderByChild,
  limitToLast,
  remove
} from './firebase-config.js';

import { getCurrentUser } from './app.js';
import { showToast, formatTime, generateId } from './utils.js';

// حالة النظام
let chatState = {
  currentChatId: null,
  unreadCounts: {},
  messageListener: null
};

// =======================
// تهيئة النظام
// =======================

export const initMessages = () => {
  setupMessageListeners();
  console.log('✅ Messages System Initialized');
};

// =======================
// تحميل قائمة المحادثات
// =======================

export const loadChatList = async (userId) => {

  if (!userId) return;

  const container = document.getElementById('messages-container');

  if (!container) return;

  container.innerHTML = `
    <div class="chat-header">
      <h3>الرسائل الخاصة</h3>

      <button class="btn btn-sm btn-danger" onclick="deleteAllChats()">
        <i class="fas fa-trash"></i>
        حذف الكل
      </button>
    </div>

    <div id="chat-list" class="chat-list">
      <div class="loading-posts">
        <div class="spinner"></div>
        <p>جاري التحميل...</p>
      </div>
    </div>
  `;

  try {

    const chatsRef = ref(database, 'messages');

    const snapshot = await new Promise((resolve) => {

      onValue(
        chatsRef,
        (snap) => resolve(snap),
        () => resolve(null)
      );

    });

    const listEl = document.getElementById('chat-list');

    if (!snapshot || !snapshot.exists()) {

      listEl.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>لا توجد رسائل بعد</p>
        </div>
      `;

      return;
    }

    const chats = [];

    snapshot.forEach(child => {

      const chat = {
        id: child.key,
        ...child.val()
      };

      if (chat.participants?.[userId]) {
        chats.push(chat);
      }

    });

    chats.sort((a, b) => {
      return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
    });

    listEl.innerHTML = '';

    for (const chat of chats) {

      const otherUid = Object.keys(chat.participants || {})
        .find(uid => uid !== userId);

      if (!otherUid) continue;

      const otherUser = await getUserData(otherUid);

      const unread = chat.unread?.[userId] || 0;

      listEl.insertAdjacentHTML(
        'beforeend',
        createChatItem(chat, otherUser, unread)
      );

    }

    listEl.querySelectorAll('.chat-item').forEach(item => {

      item.addEventListener('click', () => {

        const chatId = item.dataset.chatId;

        openChatWindow(chatId);

      });

    });

    updateMessagesBadge(userId);

  } catch (error) {

    console.error('LoadChatList Error:', error);

    document.getElementById('chat-list').innerHTML = `
      <div class="empty-state">
        <p>فشل تحميل المحادثات</p>
      </div>
    `;
  }
};

// =======================
// عنصر المحادثة
// =======================

const createChatItem = (chat, otherUser, unread) => {

  const isOnline = otherUser?.isOnline || false;

  return `
    <div class="chat-item ${unread ? 'unread' : ''}" data-chat-id="${chat.id}">

      <div class="chat-avatar">
        <img src="${otherUser?.photoURL || 'img/placeholder-avatar.png'}">

        ${isOnline ? `
          <span class="online-indicator"></span>
        ` : ''}
      </div>

      <div class="chat-info">

        <div class="chat-header">

          <span class="chat-name username">
            ${otherUser?.name || 'مستخدم'}
          </span>

          <span class="chat-time">
            ${formatTime(chat.lastTimestamp)}
          </span>

        </div>

        <p class="chat-last-message">
          ${chat.lastMessage || 'ابدأ المحادثة...'}
        </p>

      </div>

      ${unread ? `
        <span class="chat-badge">${unread}</span>
      ` : ''}

      <button
        class="menu-btn"
        onclick="event.stopPropagation(); deleteChat('${chat.id}')"
      >
        <i class="fas fa-times"></i>
      </button>

    </div>
  `;
};

// =======================
// فتح المحادثة
// =======================

export const openChatWindow = async (chatId) => {

  const user = getCurrentUser();

  if (!user) return;

  chatState.currentChatId = chatId;

  await loadMessages(chatId);

  await markMessagesAsRead(chatId, user.uid);

  setupRealtimeMessages(chatId);
};

// =======================
// تحميل الرسائل
// =======================

const loadMessages = async (chatId) => {

  const container = document.getElementById('chat-messages');

  if (!container) return;

  try {

    const messagesRef = ref(
      database,
      `messages/${chatId}/messages`
    );

    const snapshot = await new Promise((resolve) => {

      onValue(
        query(
          messagesRef,
          orderByChild('timestamp'),
          limitToLast(50)
        ),
        (snap) => resolve(snap),
        () => resolve(null)
      );

    });

    container.innerHTML = '';

    if (!snapshot || !snapshot.exists()) {

      container.innerHTML = `
        <div class="empty-state">
          <p>ابدأ المحادثة بكتابة رسالة 💬</p>
        </div>
      `;

      return;
    }

    const currentUser = getCurrentUser();

    snapshot.forEach(child => {

      const msg = {
        id: child.key,
        ...child.val()
      };

      container.insertAdjacentHTML(
        'beforeend',
        createMessageElement(msg, currentUser.uid)
      );

    });

    container.scrollTop = container.scrollHeight;

  } catch (error) {

    console.error('LoadMessages Error:', error);

    container.innerHTML = `
      <div class="empty-state">
        <p>فشل تحميل الرسائل</p>
      </div>
    `;
  }
};

// =======================
// عنصر الرسالة
// =======================

const createMessageElement = (msg, currentUid) => {

  const isSent = msg.senderId === currentUid;

  return `
    <div
      class="message ${isSent ? 'sent' : 'received'}"
      data-msg-id="${msg.id}"
    >

      <p>${sanitizeText(msg.text)}</p>

      <small class="message-time">
        ${formatTime(msg.timestamp)}
      </small>

    </div>
  `;
};

// =======================
// إرسال رسالة
// =======================

export const sendMessage = async (e, chatId) => {

  e.preventDefault();

  const user = getCurrentUser();

  if (!user) return;

  const input = document.getElementById('message-input');

  const text = input.value.trim();

  if (!text) return;

  try {

    const newMsgRef = push(
      ref(database, `messages/${chatId}/messages`)
    );

    const messageData = {
      senderId: user.uid,
      senderName: user.displayName,
      senderPhoto: user.photoURL,
      text: sanitizeText(text),
      timestamp: Date.now(),
      read: false
    };

    await set(newMsgRef, messageData);

    await update(
      ref(database, `messages/${chatId}`),
      {
        lastMessage: text,
        lastTimestamp: Date.now()
      }
    );

    input.value = '';

  } catch (error) {

    console.error('SendMessage Error:', error);

    showToast('فشل إرسال الرسالة', 'error');
  }
};

// =======================
// الوقت الحقيقي
// =======================

const setupRealtimeMessages = (chatId) => {

  const messagesRef = ref(
    database,
    `messages/${chatId}/messages`
  );

  const currentUser = getCurrentUser();

  onValue(
    query(
      messagesRef,
      orderByChild('timestamp'),
      limitToLast(1)
    ),
    (snapshot) => {

      if (!snapshot.exists()) return;

      const container = document.getElementById('chat-messages');

      if (!container) return;

      snapshot.forEach(child => {

        const msg = {
          id: child.key,
          ...child.val()
        };

        if (
          !document.querySelector(`[data-msg-id="${msg.id}"]`)
        ) {

          container.insertAdjacentHTML(
            'beforeend',
            createMessageElement(msg, currentUser.uid)
          );

          container.scrollTop = container.scrollHeight;
        }

      });

    }
  );
};

// =======================
// المقروءة
// =======================

const markMessagesAsRead = async (chatId, userId) => {

  try {

    await set(
      ref(database, `messages/${chatId}/unread/${userId}`),
      0
    );

  } catch (error) {

    console.error(error);
  }
};

// =======================
// تحديث الشارات
// =======================

export const updateMessagesBadge = async (userId) => {

  if (!userId) return;

  try {

    const chatsRef = ref(database, 'messages');

    onValue(chatsRef, (snapshot) => {

      let totalUnread = 0;

      snapshot.forEach(child => {

        const chat = child.val();

        if (chat.participants?.[userId]) {
          totalUnread += chat.unread?.[userId] || 0;
        }

      });

      const badges = document.querySelectorAll(
        '#messages-badge, #nav-msg-badge'
      );

      badges.forEach(badge => {

        if (totalUnread > 0) {

          badge.textContent =
            totalUnread > 99 ? '99+' : totalUnread;

          badge.classList.remove('hidden');

        } else {

          badge.classList.add('hidden');
        }

      });

    });

  } catch (error) {

    console.error(error);
  }
};

// =======================
// حذف محادثة
// =======================

export const deleteChat = async (chatId) => {

  if (!confirm('حذف هذه المحادثة؟')) return;

  try {

    await remove(ref(database, `messages/${chatId}`));

    showToast('تم حذف المحادثة', 'success');

  } catch (error) {

    console.error(error);
  }
};

// =======================
// حذف الكل
// =======================

export const deleteAllChats = async () => {

  if (!confirm('⚠️ حذف جميع المحادثات؟')) return;

  const user = getCurrentUser();

  if (!user) return;

  try {

    const chatsRef = ref(database, 'messages');

    onValue(chatsRef, async (snapshot) => {

      const deletes = [];

      snapshot.forEach(child => {

        const chat = child.val();

        if (chat.participants?.[user.uid]) {
          deletes.push(remove(child.ref));
        }

      });

      await Promise.all(deletes);

      showToast('تم حذف جميع المحادثات', 'success');

      loadChatList(user.uid);

    }, { onlyOnce: true });

  } catch (error) {

    console.error(error);

    showToast('فشل الحذف', 'error');
  }
};

// =======================
// دوال مساعدة
// =======================

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

const sanitizeText = (text) => {

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const setupMessageListeners = () => {

  const user = getCurrentUser();

  if (!user) return;

  onValue(
    ref(database, 'messages'),
    () => updateMessagesBadge(user.uid)
  );
};

// =======================
// window
// =======================

window.deleteChat = deleteChat;
window.deleteAllChats = deleteAllChats;

// =======================
// export default
// =======================

export default {
  initMessages,
  loadChatList,
  openChatWindow,
  sendMessage,
  deleteChat,
  deleteAllChats,
  updateMessagesBadge
};