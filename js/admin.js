// 🛡️ شبوة HUB - لوحة تحكم الأدمن والمشرفين

import { 
  database, auth,
  ref, onValue, set, update, remove, query, orderByChild, equalTo, limitToLast, push
} from './firebase-config.js';

import { getCurrentUser } from './app.js';
import { showToast, formatNumber, formatTime } from './utils.js';

const ADMIN_EMAIL = 'hoopoe.myapps@gmail.com';

// صلاحيات النظام
const ROLES = {
  admin: { canBan: true, canVerify: true, canModerate: true, canAds: true, canDelete: true },
  moderator: { canBan: true, canVerify: false, canModerate: true, canAds: false, canDelete: true },
  adManager: { canBan: false, canVerify: false, canModerate: false, canAds: true, canDelete: false },
  user: { canBan: false, canVerify: false, canModerate: false, canAds: false, canDelete: false }
};

// تهيئة لوحة التحكم
export const initAdmin = () => {
  setupAdminPanel();
  console.log('✅ Admin Panel Initialized');
};

// التحقق من صلاحيات الوصول
export const checkAdminAccess = async (email) => {
  if (email === ADMIN_EMAIL) return true;
  
  // التحقق من دور المستخدم في قاعدة البيانات
  const user = getCurrentUser();
  if (!user) return false;
  
  try {
    const snapshot = await new Promise((resolve) => {
      onValue(ref(database, `users/${user.uid}/role`), 
        (snap) => resolve(snap.val()), () => resolve('user')
      );
    });
    
    return ['admin', 'moderator', 'adManager'].includes(snapshot);
  } catch {
    return false;
  }
};

// الحصول على صلاحيات المستخدم
export const getUserPermissions = async (uid) => {
  const snapshot = await new Promise((resolve) => {    onValue(ref(database, `users/${uid}/role`), 
      (snap) => resolve(snap.val()), () => resolve('user')
    );
  });
  return ROLES[snapshot] || ROLES.user;
};

// إعداد لوحة التحكم
const setupAdminPanel = async () => {
  const user = getCurrentUser();
  if (!user) return;
  
  const permissions = await getUserPermissions(user.uid);
  const isAdmin = user.email === ADMIN_EMAIL;
  
  const container = document.getElementById('admin-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="admin-panel">
      
      <!-- إحصائيات سريعة -->
      <div class="admin-stats">
        <div class="admin-stat-card">
          <i class="fas fa-users" style="font-size:2rem;color:var(--gold-primary)"></i>
          <div class="admin-stat-value" id="stat-users">-</div>
          <div class="admin-stat-label">إجمالي الأعضاء</div>
        </div>
        <div class="admin-stat-card">
          <i class="fas fa-flag" style="font-size:2rem;color:var(--error)"></i>
          <div class="admin-stat-value" id="stat-reports">-</div>
          <div class="admin-stat-label">بلاغات جديدة</div>
        </div>
        <div class="admin-stat-card">
          <i class="fas fa-newspaper" style="font-size:2rem;color:var(--info)"></i>
          <div class="admin-stat-value" id="stat-posts">-</div>
          <div class="stat-label">منشورات اليوم</div>
        </div>
        <div class="admin-stat-card">
          <i class="fas fa-chart-line" style="font-size:2rem;color:var(--success)"></i>
          <div class="admin-stat-value" id="stat-active">-</div>
          <div class="admin-stat-label">نشطون الآن</div>
        </div>
      </div>
      
      <!-- قسم البلاغات -->
      ${permissions.canModerate ? `
        <div class="admin-section">
          <div class="admin-section-header">
            <span><i class="fas fa-flag"></i> البلاغات (${permissions.canModerate ? 'للمراجعة' : 'للمشاهدة فقط'})</span>            <button class="btn btn-sm btn-secondary" onclick="refreshReports()">
              <i class="fas fa-sync"></i> تحديث
            </button>
          </div>
          <div class="admin-section-body" id="reports-list">
            <div class="loading-posts"><div class="spinner"></div></div>
          </div>
        </div>
      ` : ''}
      
      <!-- إدارة المستخدمين -->
      ${permissions.canBan || permissions.canVerify ? `
        <div class="admin-section">
          <div class="admin-section-header">
            <span><i class="fas fa-user-cog"></i> إدارة المستخدمين</span>
          </div>
          <div class="admin-section-body">
            <div class="search-box" style="margin-bottom:15px">
              <input type="text" id="admin-search" placeholder="ابحث بالاسم أو @username..." 
                     oninput="searchUsers(this.value)">
            </div>
            <div id="admin-users-list"></div>
          </div>
        </div>
      ` : ''}
      
      <!-- الإعلانات التجارية -->
      ${permissions.canAds || isAdmin ? `
        <div class="admin-section">
          <div class="admin-section-header">
            <span><i class="fas fa-ad"></i> الإعلانات التجارية</span>
            ${isAdmin ? `<button class="btn btn-sm btn-gold" onclick="openAdForm()">
              <i class="fas fa-plus"></i> إعلان جديد
            </button>` : ''}
          </div>
          <div class="admin-section-body" id="ads-list">
            <!-- سيتم تحميل الإعلانات هنا -->
          </div>
        </div>
      ` : ''}
      
      <!-- سجل الإجراءات -->
      <div class="admin-section">
        <div class="admin-section-header">
          <span><i class="fas fa-history"></i> سجل الإجراءات</span>
        </div>
        <div class="admin-section-body" id="action-log">
          <div class="empty-state">لا توجد إجراءات حديثة</div>
        </div>
      </div>      
    </div>
  `;
  
  // تحميل البيانات
  loadAdminStats();
  if (permissions.canModerate) loadReports();
  if (permissions.canBan || permissions.canVerify) loadUsersForAdmin();
  if (permissions.canAds) loadAds();
  
  // تسجيل الدخول في السجل
  logAdminAction(user.uid, 'login', 'دخول لوحة التحكم');
};

// تحميل إحصائيات الأدمن
const loadAdminStats = async () => {
  try {
    // عدد المستخدمين
    const usersSnap = await new Promise((resolve) => {
      onValue(ref(database, 'users'), (snap) => resolve(snap), () => resolve(null));
    });
    document.getElementById('stat-users').textContent = 
      formatNumber(usersSnap?.size || 0);
    
    // عدد البلاغات
    const reportsSnap = await new Promise((resolve) => {
      onValue(ref(database, 'admin/reports'), (snap) => resolve(snap), () => resolve(null));
    });
    let unresolved = 0;
    reportsSnap?.forEach(child => {
      if (!child.val().resolved) unresolved++;
    });
    document.getElementById('stat-reports').textContent = formatNumber(unresolved);
    
    // منشورات اليوم
    const today = new Date();
    today.setHours(0,0,0,0);
    const postsSnap = await new Promise((resolve) => {
      onValue(query(ref(database, 'posts'), orderByChild('timestamp'), 
        startAt(today.getTime())), (snap) => resolve(snap), () => resolve(null)
      );
    });
    document.getElementById('stat-posts').textContent = formatNumber(postsSnap?.size || 0);
    
    // النشطون الآن (آخر 5 دقائق)
    const activeThreshold = Date.now() - 5 * 60 * 1000;
    let activeCount = 0;
    usersSnap?.forEach(child => {
      const user = child.val();
      if (user?.lastSeen > activeThreshold) activeCount++;    });
    document.getElementById('stat-active').textContent = formatNumber(activeCount);
    
  } catch (error) {
    console.error('LoadStats Error:', error);
  }
};

// تحميل البلاغات
const loadReports = async () => {
  const container = document.getElementById('reports-list');
  if (!container) return;
  
  try {
    const reportsRef = ref(database, 'admin/reports');
    const snapshot = await new Promise((resolve) => {
      onValue(query(reportsRef, orderByChild('timestamp'), limitToLast(20)), 
        (snap) => resolve(snap), () => resolve(null)
      );
    });
    
    if (!snapshot?.exists()) {
      container.innerHTML = '<div class="empty-state">✅ لا توجد بلاغات جديدة</div>';
      return;
    }
    
    container.innerHTML = '';
    
    snapshot.forEach(child => {
      const report = { id: child.key, ...child.val() };
      if (report.resolved) return; // تخطي المحلولة
      
      container.insertAdjacentHTML('beforeend', createReportItem(report));
    });
    
  } catch (error) {
    console.error('LoadReports Error:', error);
    container.innerHTML = '<div class="empty-state">فشل تحميل البلاغات</div>';
  }
};

// إنشاء عنصر بلاغ
const createReportItem = (report) => {
  return `
    <div class="report-item" data-report-id="${report.id}">
      <div class="report-header">
        <span class="report-user">@${report.reportedUsername}</span>
        <span class="report-time">${formatTime(report.timestamp)}</span>
      </div>
      <p class="report-reason">📋 ${report.reason}</p>      <p class="report-content" style="font-size:0.9rem;color:var(--text-secondary)">
        "${report.contentPreview?.substring(0, 150)}${report.contentPreview?.length > 150 ? '...' : ''}"
      </p>
      <div class="report-actions">
        <button class="btn btn-sm btn-secondary" onclick="viewReport('${report.id}')">
          <i class="fas fa-eye"></i> عرض
        </button>
        <button class="btn btn-sm btn-danger" onclick="takeAction('${report.id}', 'ban')">
          <i class="fas fa-ban"></i> حظر
        </button>
        <button class="btn btn-sm btn-warning" onclick="takeAction('${report.id}', 'warn')">
          <i class="fas fa-exclamation-triangle"></i> تحذير
        </button>
        <button class="btn btn-sm btn-success" onclick="resolveReport('${report.id}')">
          <i class="fas fa-check"></i> حل
        </button>
      </div>
    </div>
  `;
};

// اتخاذ إجراء ضد بلاغ
export const takeAction = async (reportId, action) => {
  const user = getCurrentUser();
  if (!user) return;
  
  const permissions = await getUserPermissions(user.uid);
  if (!permissions.canModerate && user.email !== ADMIN_EMAIL) {
    showToast('غير مصرح لك', 'error');
    return;
  }
  
  const reportRef = ref(database, `admin/reports/${reportId}`);
  const report = await new Promise((resolve) => {
    onValue(reportRef, (snap) => resolve(snap.val()), () => resolve(null));
  });
  
  if (!report) return;
  
  const targetUid = report.reportedUserId;
  
  try {
    switch(action) {
      case 'ban':
        await update(ref(database, `users/${targetUid}`), {
          banned: true,
          bannedAt: Date.now(),
          bannedBy: user.uid,
          banReason: report.reason
        });        showToast('تم حظر الحساب ✓', 'success');
        break;
        
      case 'warn':
        // إرسال إشعار تحذير
        await push(ref(database, `notifications/${targetUid}`), {
          type: 'system',
          text: `⚠️ تحذير: ${report.reason}`,
          fromUserId: 'admin',
          fromUserName: 'إدارة شبوة HUB',
          timestamp: Date.now(),
          read: false,
          isWarning: true
        });
        // إضافة علامة تحذير في الملف الشخصي
        await update(ref(database, `users/${targetUid}`), {
          warnings: (await getUserField(targetUid, 'warnings') || 0) + 1,
          lastWarning: Date.now()
        });
        showToast('تم إرسال التحذير ✓', 'success');
        break;
    }
    
    // حل البلاغ تلقائياً
    await update(reportRef, {
      resolved: true,
      resolvedAt: Date.now(),
      resolvedBy: user.uid,
      action: action
    });
    
    // تسجيل الإجراء
    logAdminAction(user.uid, action, `إجراء على @${report.reportedUsername}: ${action}`);
    
    // تحديث الواجهة
    refreshReports();
    
  } catch (error) {
    console.error('TakeAction Error:', error);
    showToast('فشل تنفيذ الإجراء', 'error');
  }
};

// حل بلاغ بدون إجراء
export const resolveReport = async (reportId) => {
  if (!confirm('تحديد هذا البلاغ كمحل دون اتخاذ إجراء؟')) return;
  
  const user = getCurrentUser();
  if (!user) return;
    try {
    await update(ref(database, `admin/reports/${reportId}`), {
      resolved: true,
      resolvedAt: Date.now(),
      resolvedBy: user.uid,
      action: 'dismissed'
    });
    
    logAdminAction(user.uid, 'dismiss', 'تم تجاهل بلاغ');
    refreshReports();
    showToast('تم حل البلاغ ✓', 'success');
    
  } catch (error) {
    console.error('ResolveReport Error:', error);
  }
};

// عرض تفاصيل بلاغ
export const viewReport = async (reportId) => {
  const reportRef = ref(database, `admin/reports/${reportId}`);
  const report = await new Promise((resolve) => {
    onValue(reportRef, (snap) => resolve(snap.val()), () => resolve(null));
  });
  
  if (!report) return;
  
  // فتح المنشور المبلغ عنه
  if (report.postId) {
    // الانتقال للمنشور
    showToast('جاري عرض المنشور المبلغ عنه...', 'info');
    // سيتم تنفيذ الانتقال هنا
  }
};

// تحديث البلاغات
export const refreshReports = () => {
  loadReports();
  loadAdminStats();
};

// تحميل المستخدمين للإدارة
const loadUsersForAdmin = async () => {
  const container = document.getElementById('admin-users-list');
  if (!container) return;
  
  try {
    const usersRef = ref(database, 'users');
    const snapshot = await new Promise((resolve) => {
      onValue(query(usersRef, limitToLast(30)), (snap) => resolve(snap), () => resolve(null));
    });    
    if (!snapshot?.exists()) return;
    
    container.innerHTML = '';
    
    snapshot.forEach(child => {
      const user = { uid: child.key, ...child.val() };
      container.insertAdjacentHTML('beforeend', createAdminUserItem(user));
    });
    
  } catch (error) {
    console.error('LoadUsers Error:', error);
  }
};

// إنشاء عنصر مستخدم في لوحة الأدمن
const createAdminUserItem = (user) => {
  const currentUser = getCurrentUser();
  const permissions = ROLES[currentUser?.role] || ROLES.user;
  
  return `
    <div class="card" style="padding:12px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:12px">
        <img src="${user.photoURL || 'img/placeholder-avatar.png'}" 
             style="width:40px;height:40px;border-radius:50%">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;display:flex;align-items:center;gap:5px">
            ${user.name}
            ${user.verified ? '<i class="fas fa-check-circle" style="color:var(--gold-primary)"></i>' : ''}
            ${user.role !== 'user' ? `<span style="font-size:0.8rem;padding:2px 8px;background:var(--gold-primary);color:#000;border-radius:10px">${user.role}</span>` : ''}
          </div>
          <div style="font-size:0.85rem;color:var(--text-muted)">@${user.username}</div>
        </div>
        <div style="display:flex;gap:5px">
          ${permissions.canVerify && currentUser?.email === ADMIN_EMAIL ? `
            <button class="btn btn-sm ${user.verified ? 'btn-secondary' : 'btn-gold'}" 
                    onclick="toggleVerify('${user.uid}')">
              ${user.verified ? '✓' : 'توثيق'}
            </button>
          ` : ''}
          ${permissions.canBan ? `
            <button class="btn btn-sm ${user.banned ? 'btn-success' : 'btn-danger'}" 
                    onclick="toggleBan('${user.uid}')">
              ${user.banned ? 'فك' : 'حظر'}
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;};

// توثيق/إلغاء توثيق حساب (للأدمن فقط)
export const toggleVerify = async (targetUid) => {
  const user = getCurrentUser();
  if (user?.email !== ADMIN_EMAIL) {
    showToast('هذه الصلاحية للأدمن فقط', 'error');
    return;
  }
  
  try {
    const current = await getUserField(targetUid, 'verified');
    await update(ref(database, `users/${targetUid}`), {
      verified: !current,
      updatedAt: Date.now()
    });
    
    showToast(`تم ${!current ? 'توثيق' : 'إلغاء توثيق'} الحساب ✓`, 'success');
    loadUsersForAdmin();
    
  } catch (error) {
    console.error('ToggleVerify Error:', error);
  }
};

// حظر/فك حظر حساب
export const toggleBan = async (targetUid) => {
  const user = getCurrentUser();
  const permissions = await getUserPermissions(user?.uid);
  
  if (!permissions.canBan && user?.email !== ADMIN_EMAIL) {
    showToast('غير مصرح لك', 'error');
    return;
  }
  
  try {
    const current = await getUserField(targetUid, 'banned');
    await update(ref(database, `users/${targetUid}`), {
      banned: !current,
      bannedAt: !current ? Date.now() : null,
      bannedBy: !current ? user?.uid : null
    });
    
    showToast(`تم ${!current ? 'حظر' : 'فك حظر'} الحساب ✓`, 'success');
    loadUsersForAdmin();
    
  } catch (error) {
    console.error('ToggleBan Error:', error);
  }
};
// البحث عن المستخدمين
export const searchUsers = async (query) => {
  if (!query || query.length < 2) {
    loadUsersForAdmin();
    return;
  }
  
  const container = document.getElementById('admin-users-list');
  if (!container) return;
  
  container.innerHTML = '<div class="loading-posts"><div class="spinner spinner-sm"></div></div>';
  
  try {
    // البحث بالاسم
    const usersRef = ref(database, 'users');
    const snapshot = await new Promise((resolve) => {
      onValue(usersRef, (snap) => resolve(snap), () => resolve(null));
    });
    
    const results = [];
    snapshot?.forEach(child => {
      const user = { uid: child.key, ...child.val() };
      if (user.name?.toLowerCase().includes(query.toLowerCase()) || 
          user.username?.toLowerCase().includes(query.toLowerCase())) {
        results.push(user);
      }
    });
    
    container.innerHTML = '';
    
    if (results.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد نتائج</div>';
      return;
    }
    
    results.forEach(user => {
      container.insertAdjacentHTML('beforeend', createAdminUserItem(user));
    });
    
  } catch (error) {
    console.error('SearchUsers Error:', error);
    container.innerHTML = '<div class="empty-state">فشل البحث</div>';
  }
};

// نظام الإعلانات التجارية
const loadAds = async () => {
  const container = document.getElementById('ads-list');
  if (!container) return;  
  try {
    const adsRef = ref(database, 'ads');
    const snapshot = await new Promise((resolve) => {
      onValue(query(adsRef, orderByChild('createdAt'), limitToLast(10)), 
        (snap) => resolve(snap), () => resolve(null)
      );
    });
    
    if (!snapshot?.exists()) {
      container.innerHTML = '<div class="empty-state">لا توجد إعلانات حالياً</div>';
      return;
    }
    
    container.innerHTML = '';
    
    snapshot.forEach(child => {
      const ad = { id: child.key, ...child.val() };
      container.insertAdjacentHTML('beforeend', createAdItem(ad));
    });
    
  } catch (error) {
    console.error('LoadAds Error:', error);
  }
};

const createAdItem = (ad) => {
  return `
    <div class="card" style="margin-bottom:12px">
      <div class="ad-carousel" style="border-radius:var(--radius-md);overflow:hidden">
        ${ad.images?.[0] ? `<img src="${ad.images[0]}" style="width:100%;aspect-ratio:16/9;object-fit:cover">` : ''}
      </div>
      <div style="padding:12px">
        <h4 style="color:var(--gold-primary);margin-bottom:8px">${ad.title}</h4>
        <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:10px">
          ${ad.content?.substring(0, 100)}${ad.content?.length > 100 ? '...' : ''}
        </p>
        ${ad.whatsapp ? `
          <a href="https://wa.me/${ad.whatsapp}" target="_blank" 
             class="ad-whatsapp" style="font-size:0.9rem">
            <i class="fab fa-whatsapp"></i> تواصل عبر واتساب
          </a>
        ` : ''}
      </div>
      <div style="padding:12px;border-top:1px solid var(--border-color);display:flex;gap:8px">
        <button class="btn btn-sm btn-secondary" onclick="editAd('${ad.id}')">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteAd('${ad.id}')">
          <i class="fas fa-trash"></i>        </button>
        <button class="btn btn-sm ${ad.active ? 'btn-success' : 'btn-secondary'}" 
                onclick="toggleAdStatus('${ad.id}')">
          ${ad.active ? 'نشط' : 'غير نشط'}
        </button>
      </div>
    </div>
  `;
};

// فتح نموذج إعلان جديد
export const openAdForm = () => {
  showToast('🚧 نموذج الإعلانات: قيد التطوير', 'info');
  // سيتم تنفيذه كاملاً لاحقاً
};

// تسجيل إجراء إداري
const logAdminAction = async (adminUid, action, description) => {
  try {
    await push(ref(database, 'admin/actionLog'), {
      adminUid,
      action,
      description,
      timestamp: Date.now(),
      ip: 'web' // يمكن إضافة عنوان IP لاحقاً
    });
  } catch (e) { console.error('LogAction Error:', e); }
};

// دوال مساعدة
const getUserField = async (uid, field) => {
  const snapshot = await new Promise((resolve) => {
    onValue(ref(database, `users/${uid}/${field}`), 
      (snap) => resolve(snap.val()), () => resolve(null)
    );
  });
  return snapshot;
};

// تصدير الدوال العامة
export const viewReportDetails = viewReport;
export const refreshAdminPanel = () => {
  loadAdminStats();
  loadReports();
  loadUsersForAdmin();
  loadAds();
};

// تصدير
export default {  initAdmin,
  checkAdminAccess,
  getUserPermissions,
  takeAction,
  resolveReport,
  toggleVerify,
  toggleBan,
  searchUsers,
  refreshAdminPanel
};

// دوال عالمية
window.ShabwaHub = {
  ...window.ShabwaHub,
  takeAction,
  resolveReport,
  toggleVerify,
  toggleBan,
  searchUsers,
  refreshAdminPanel,
  viewReport
};