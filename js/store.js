// Tiny IndexedDB key-value store, shared by the page and the service worker
// (the service worker can't read localStorage).
const Store = (() => {
  let dbPromise;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('dondever', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function get(key, fallback) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('kv').objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result === undefined ? fallback : req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function set(key, value) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  return { get, set };
})();
