// 🛠️ شبوة HUB - دوال مساعدة عامة (محدث مع نظام ImgBB الذكي)

// ⚙️ مفاتيح ImgBB - نظام التوزيع الذكي + الاحتياط التلقائي
// 🔑 تم التحديث: 2026
const IMG_BB_KEYS = [
  "5bdec6dfdf9643fdb369a994d5fc8edc",
  "4827bc64a597d07d8be944ad0f693051",
  "79890231a72773467e7b0079d24a5cbb",
  "d825a7445098e8a4452fd7d9cebe5fb9",
  "113686812268d32cbeca727d4c209c9a"
];

const IMG_BB_API = "https://api.imgbb.com/1/upload";

// عداد دائري لتوزيع المفاتيح (يبدأ من قيمة عشوائية لتجنب التحميل على نفس المفتاح)
let keyIndex = Math.floor(Math.random() * IMG_BB_KEYS.length);

// 📤 دالة رفع الصور إلى ImgBB مع نظام التوزيع الذكي والاحتياط
export const uploadToImgBB = async (file, retryCount = 0) => {
  if (!file) throw new Error('لا يوجد ملف للرفع');
  
  // التحقق من حجم الصورة (أقصى حجم 32 ميجا كما تسمح ImgBB)
  const MAX_SIZE = 32 * 1024 * 1024; // 32MB
  if (file.size > MAX_SIZE) {
    throw new Error('حجم الصورة كبير جداً، الحد الأقصى 32 ميجابايت');
  }
  
  const formData = new FormData();
  formData.append('image', file);
  formData.append('name', file.name || `shabwahub_${Date.now()}`);
  formData.append('expiration', '600'); // 10 دقائق كحد أدنى للكاش (يمكن زيادته)
  
  let attempts = 0;
  const maxAttempts = IMG_BB_KEYS.length;
  
  while (attempts < maxAttempts) {
    const currentKey = IMG_BB_KEYS[keyIndex];
    const usedKeyIndex = keyIndex;
    
    // تحريك المؤشر للمفتاح التالي (نظام دائري)
    keyIndex = (keyIndex + 1) % IMG_BB_KEYS.length;
    
    try {
      const response = await fetch(`${IMG_BB_API}?key=${currentKey}`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json'
        }
      });      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data?.url) {
        // ✅ نجاح الرفع
        console.log(`✅ ImgBB Upload Success | Key #${usedKeyIndex + 1} | URL: ${result.data.url}`);
        return {
          url: result.data.url,
          thumb: result.data.thumb?.url || result.data.url,
          size: file.size,
          name: result.data.name,
          uploadedAt: Date.now()
        };
      }
      
      // إذا كانت هناك رسالة خطأ من API
      if (result.error?.message) {
        throw new Error(result.error.message);
      }
      
      throw new Error('استجابة غير متوقعة من الخادم');
      
    } catch (error) {
      console.warn(`⚠️ ImgBB Key #${usedKeyIndex + 1} failed (Attempt ${attempts + 1}/${maxAttempts}): ${error.message}`);
      
      attempts++;
      
      // إذا استُنزفت جميع المحاولات
      if (attempts >= maxAttempts) {
        // محاولة أخيرة مع تأخير بسيط (للتعامل مع مشاكل الشبكة المؤقتة)
        if (retryCount < 2) {
          console.log(`🔄 Retry #${retryCount + 1} after delay...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          return uploadToImgBB(file, retryCount + 1);
        }
        
        console.error('❌ All ImgBB keys exhausted. Upload failed.');
        throw new Error('فشل رفع الصورة: جميع مفاتيح الرفع غير متاحة حالياً. حاول مرة أخرى لاحقاً.');
      }
      
      // تأخير بسيط قبل المحاولة بالمفتاح التالي
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // نقطة أمان إضافية (لا يجب الوصول هنا نظرياً)  throw new Error('خطأ غير متوقع في نظام رفع الصور');
};

// 🖼️ دالة مساعدة لرفع عدة صور دفعة واحدة
export const uploadMultipleImages = async (files, onProgress = null) => {
  if (!files || files.length === 0) return [];
  
  const results = [];
  const total = files.length;
  
  for (let i = 0; i < total; i++) {
    try {
      const result = await uploadToImgBB(files[i]);
      results.push(result);
      
      // تحديث شريط التقدم إذا وُجد
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: total,
          percent: Math.round(((i + 1) / total) * 100),
          lastResult: result
        });
      }
    } catch (error) {
      console.error(`❌ Failed to upload image ${i + 1}:`, error);
      // الاستمرار في رفع باقي الصور حتى مع فشل واحدة
      results.push({ error: error.message, file: files[i].name });
    }
  }
  
  return results;
};

// 🔍 دالة للتحقق من حالة المفاتيح (لأغراض الصيانة)
export const checkImgBBKeysStatus = async () => {
  const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const results = [];
  
  for (let i = 0; i < IMG_BB_KEYS.length; i++) {
    try {
      const response = await fetch(`${IMG_BB_API}?key=${IMG_BB_KEYS[i]}`, {
        method: 'POST',
        body: (() => {
          const fd = new FormData();
          fd.append('image', testImage);
          return fd;
        })()
      });
      const result = await response.json();      results.push({
        keyIndex: i + 1,
        status: result.success ? '✅ OK' : `❌ ${result.error?.message || 'Unknown'}`,
        remaining: result.data?.remaining || 'N/A'
      });
    } catch (error) {
      results.push({
        keyIndex: i + 1,
        status: `❌ ${error.message}`,
        remaining: 'N/A'
      });
    }
  }
  
  return results;
};

// 🧹 دالة لتنظيف روابط الصور القديمة (اختياري)
export const cleanupOldUploads = async (urls, keepDays = 7) => {
  // ⚠️ ملاحظة: ImgBB لا يوفر واجهة لحذف الصور برمجياً في الخطة المجانية
  // يمكن تنفيذ هذا لاحقاً عبر Cloud Function أو خطة مدفوعة
  console.log('ℹ️ Cleanup feature requires ImgBB Pro API');
  return { success: false, message: 'Feature not available in free tier' };
};

// توليد معرف فريد
export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

// تنسيق الطوابع الزمنية
export const formatTime = (timestamp) => {
  if (!timestamp) return '';
  
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} د`;
  if (hours < 24) return `منذ ${hours} س`;
  if (days < 7) return `منذ ${days} ي`;
  
  return new Date(timestamp).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'  });
};

// تنسيق الأرقام الكبيرة
export const formatNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

// التحقق من صحة البريد الإلكتروني
export const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// التحقق من قوة كلمة المرور
export const isStrongPassword = (password) => {
  return password.length >= 8 && 
         /[A-Z]/.test(password) && 
         /[a-z]/.test(password) && 
         /[0-9]/.test(password);
};

// تنظيف النصوص من الرموز الخبيثة
export const sanitizeText = (text) => {
  if (!text) return '';
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/[<>]/g, '')
    .trim();
};

// البحث في النصوص (عربي/إنجليزي)
export const fuzzySearch = (text, query) => {
  if (!text || !query) return false;
  const normalizedText = text.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '');
  const normalizedQuery = query.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '');
  return normalizedText.includes(normalizedQuery);
};

// تقسيم النص الطويل مع زر "اقرأ المزيد"
export const truncateText = (text, maxLength = 200) => {
  if (!text || text.length <= maxLength) return { short: text, long: text, needTruncate: false };
  return {    short: text.substring(0, maxLength) + '...',
    long: text,
    needTruncate: true
  };
};

// عرض رسالة منبثقة (Toast)
export const showToast = (message, type = 'info', duration = 3000) => {
  let toast = document.getElementById('global-toast');
  
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
};

// تأكيد الإجراء
export const confirmAction = (message) => {
  return new Promise((resolve) => {
    if (window.confirm(message)) {
      resolve(true);
    } else {
      resolve(false);
    }
  });
};

// نسخ النص إلى الحافظة
export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    showToast('تم نسخ النص ✓', 'success');
    return true;
  } catch {
    // Fallback للمتصفحات القديمة
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);    showToast('تم نسخ النص ✓', 'success');
    return true;
  }
};

// التحقق من اتصال الإنترنت
export const isOnline = () => {
  return navigator.onLine;
};

// الاستماع لتغيرات الاتصال
export const onConnectionChange = (callback) => {
  window.addEventListener('online', () => callback(true));
  window.addEventListener('offline', () => callback(false));
};

// تخزين محلي آمن
export const storage = {
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  get: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  remove: (key) => {
    localStorage.removeItem(key);
  },
  clear: () => {
    localStorage.clear();
  }
};

// إدارة حالة التحميل
export const setLoading = (element, loading = true) => {
  if (!element) return;
  if (loading) {
    element.classList.add('loading');
    element.disabled = true;
  } else {
    element.classList.remove('loading');    element.disabled = false;
  }
};

// تأخير التنفيذ (Debouncing)
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// تأخير التنفيذ (Throttling)
export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// تحويل ملف إلى Base64 (للمعاينة قبل الرفع)
export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });
};

// ضغط الصورة قبل الرفع (اختياري - لتقليل الحجم)
export const compressImage = async (file, maxWidth = 1920, quality = 0.8) => {
  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
      let width = img.width;
      let height = img.height;
            // الحفاظ على نسبة الأبعاد
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
        } else {
          resolve(file); // فشل الضغط، نرجع الملف الأصلي
        }
      }, 'image/jpeg', quality);
    };
    
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
};

// 🚫 تحميل وتطبيق الكلمات الممنوعة
export const loadForbiddenWords = async () => {
  try {
    const response = await fetch('config/forbidden-words.json');
    const config = await response.json();
    
    return {
      arabic: config.arabic.filter(w => w !== 'ممنوع'),
      english: config.english.filter(w => w !== 'ممنوع'),
      action: config.action || 'replace',
      replaceWith: config.replaceWith || '***'
    };
  } catch (error) {
    console.error('Failed to load forbidden words:', error);
    return { arabic: [], english: [], action: 'replace', replaceWith: '***' };
  }
};

// 🧹 تنظيف النص من الكلمات الممنوعة
export const filterForbiddenWords = (text, forbiddenList) => {
  if (!text || !forbiddenList?.arabic?.length) return text;
  
  let filtered = text;
  
  // تصفية الكلمات العربية
  forbiddenList.arabic.forEach(word => {    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, forbiddenList.replaceWith);
  });
  
  // تصفية الكلمات الإنجليزية
  forbiddenList.english.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, forbiddenList.replaceWith);
  });
  
  return filtered;
};

// تصدير جميع الدوال
export default {
  generateId,
  formatTime,
  formatNumber,
  isValidEmail,
  isStrongPassword,
  sanitizeText,
  fuzzySearch,
  truncateText,
  uploadToImgBB,
  uploadMultipleImages,
  checkImgBBKeysStatus,
  showToast,
  confirmAction,
  copyToClipboard,
  isOnline,
  onConnectionChange,
  storage,
  setLoading,
  debounce,
  throttle,
  fileToBase64,
  compressImage,
  loadForbiddenWords,
  filterForbiddenWords
};