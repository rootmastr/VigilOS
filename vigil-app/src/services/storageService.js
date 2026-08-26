const PREFIX = 'vigilos_';

class StorageService {
  get(key, defaultValue = null) {
    const fullKey = PREFIX + key;

    try {
      const item = localStorage.getItem(fullKey);
      if (item === null) return defaultValue;

      const parsed = JSON.parse(item);

      // Check if item has expired
      if (parsed.expiry && Date.now() > parsed.expiry) {
        this.remove(key);
        return defaultValue;
      }

      return parsed.value;
    } catch (error) {
      console.error('Storage get error:', error);
      return defaultValue;
    }
  }

  set(key, value, ttl = null) {
    const fullKey = PREFIX + key;

    let item = { value };

    if (ttl) {
      item.expiry = Date.now() + ttl;
    }

    try {
      localStorage.setItem(fullKey, JSON.stringify(item));
      return true;
    } catch (error) {
      console.error('Storage set error:', error);
      return false;
    }
  }

  remove(key) {
    const fullKey = PREFIX + key;

    try {
      localStorage.removeItem(fullKey);
      return true;
    } catch (error) {
      console.error('Storage remove error:', error);
      return false;
    }
  }

  clear() {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
      keys.forEach(key => localStorage.removeItem(key));
      return true;
    } catch (error) {
      console.error('Storage clear error:', error);
      return false;
    }
  }

  has(key) {
    const fullKey = PREFIX + key;
    return localStorage.getItem(fullKey) !== null;
  }

  keys() {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .map(k => k.slice(PREFIX.length));
  }

  size() {
    return this.keys().length;
  }

  getWithFallback(key, defaultValue = null) {
    return this.get(key, defaultValue);
  }

  // Batch operations
  getMultiple(keys) {
    const result = {};
    keys.forEach(key => {
      result[key] = this.get(key);
    });
    return result;
  }

  setMultiple(items) {
    Object.entries(items).forEach(([key, value]) => {
      this.set(key, value);
    });
  }

  // Session storage methods
  setSession(key, value) {
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Session storage set error:', error);
      return false;
    }
  }

  getSession(key, defaultValue = null) {
    try {
      const item = sessionStorage.getItem(PREFIX + key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('Session storage get error:', error);
      return defaultValue;
    }
  }

  removeSession(key) {
    try {
      sessionStorage.removeItem(PREFIX + key);
      return true;
    } catch (error) {
      console.error('Session storage remove error:', error);
      return false;
    }
  }
}

export default new StorageService();
