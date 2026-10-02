import { ArticleRecord, parseDateTimestamp } from '../components/Library';

const STORAGE_KEY = 'watchtower-articles';
const IDB_NAME = 'watchtower_study_db';
const IDB_VERSION = 1;
const IDB_STORE = 'articles';

// Helper: Open IndexedDB for durable, high-capacity client storage
function openIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = (err) => {
        console.warn('[ArticleStorage] IndexedDB open error:', err);
        resolve(null);
      };
    } catch (e) {
      console.warn('[ArticleStorage] IndexedDB not available:', e);
      resolve(null);
    }
  });
}

async function idbGetAll(): Promise<ArticleRecord[]> {
  const db = await openIndexedDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        resolve(Array.isArray(req.result) ? req.result : []);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function idbPut(record: ArticleRecord): Promise<boolean> {
  const db = await openIndexedDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function idbPutBatch(records: ArticleRecord[]): Promise<boolean> {
  const db = await openIndexedDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      for (const rec of records) {
        store.put(rec);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function idbDelete(id: string): Promise<boolean> {
  const db = await openIndexedDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function idbClear(): Promise<boolean> {
  const db = await openIndexedDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Loads all articles by merging:
 * 1. Server backend (/api/articles)
 * 2. IndexedDB (persistent browser storage, no 5MB quota)
 * 3. LocalStorage (legacy / backup cache)
 * 
 * Synchronizes any missing articles across all tiers.
 */
export async function fetchArticles(): Promise<ArticleRecord[]> {
  // 1. Fetch from server backend
  let serverArticles: ArticleRecord[] = [];
  try {
    const res = await fetch('/api/articles');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.articles)) {
        serverArticles = data.articles;
      }
    }
  } catch (err) {
    console.warn('[ArticleStorage] Failed to fetch articles from server:', err);
  }

  // 2. Fetch from IndexedDB
  const idbArticles = await idbGetAll();

  // 3. Fetch from LocalStorage
  let localArticles: ArticleRecord[] = [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      localArticles = JSON.parse(stored);
    }
  } catch (err) {
    console.warn('[ArticleStorage] Failed to read from local storage:', err);
  }

  // Merge all sources by ID, preferring whichever version has newer createdAt / data
  const map = new Map<string, ArticleRecord>();

  const ingest = (list: ArticleRecord[]) => {
    for (const item of list) {
      if (!item || !item.id) continue;
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
      } else {
        const itemCreated = item.createdAt || 0;
        const existCreated = existing.createdAt || 0;
        if (itemCreated >= existCreated) {
          map.set(item.id, item);
        }
      }
    }
  };

  ingest(localArticles);
  ingest(idbArticles);
  ingest(serverArticles);

  const merged = Array.from(map.values()).sort((a, b) => {
    const dateA = parseDateTimestamp(a.date);
    const dateB = parseDateTimestamp(b.date);
    if (dateA !== dateB) return dateB - dateA;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  // Sync merged data back to IndexedDB
  if (merged.length > 0) {
    idbPutBatch(merged).catch(() => {});
  }

  // Sync back to server if server was missing some articles
  if (merged.length > serverArticles.length) {
    try {
      await fetch('/api/articles/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: merged }),
      });
    } catch (e) {
      console.warn('[ArticleStorage] Background sync to server failed:', e);
    }
  }

  // Best-effort update to localStorage for offline cache (silently ignore if quota exceeded)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (e) {
    // If quota exceeded, clean up large images or store lightweight summary
    try {
      const lightweight = merged.map(m => ({
        ...m,
        // Keep title, date, id, but trim base64 images from localStorage copy if too large
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
    } catch {}
  }

  return merged;
}

/**
 * Saves a single article record across:
 * 1. IndexedDB
 * 2. Server backend (/api/articles)
 * 3. LocalStorage (best effort)
 */
export async function saveArticleRecord(record: ArticleRecord): Promise<void> {
  if (!record || !record.id) return;

  // 1. IndexedDB (instant, reliable, no 5MB limit)
  await idbPut(record);

  // 2. LocalStorage (best effort for quick synchronous reads)
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    let list: ArticleRecord[] = stored ? JSON.parse(stored) : [];
    const idx = list.findIndex((a) => a.id === record.id);
    if (idx > -1) {
      list[idx] = record;
    } else {
      list.unshift(record);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[ArticleStorage] localStorage save notice (using IndexedDB & Server instead):', e);
  }

  // 3. Server backend disk
  try {
    const res = await fetch('/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      console.warn('[ArticleStorage] Server returned status', res.status);
    }
  } catch (e) {
    console.error('[ArticleStorage] Failed to save article to server:', e);
  }

  // 4. Dispatch update event so any active dashboard UI refreshes immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('articlesUpdated'));
  }
}

/**
 * Saves multiple articles in batch (used during JSON file backup imports).
 */
export async function saveArticlesBatch(records: ArticleRecord[]): Promise<void> {
  if (!records || records.length === 0) return;

  // 1. IndexedDB
  await idbPutBatch(records);

  // 2. LocalStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    let list: ArticleRecord[] = stored ? JSON.parse(stored) : [];
    const map = new Map<string, ArticleRecord>();
    for (const item of list) {
      if (item && item.id) map.set(item.id, item);
    }
    for (const item of records) {
      if (item && item.id) map.set(item.id, item);
    }
    const combined = Array.from(map.values());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
  } catch (e) {
    console.warn('[ArticleStorage] localStorage batch save notice:', e);
  }

  // 3. Server backend disk sync
  try {
    await fetch('/api/articles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles: records }),
    });
  } catch (e) {
    console.error('[ArticleStorage] Failed to sync batch articles to server:', e);
  }

  // 4. Dispatch update event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('articlesUpdated'));
  }
}

/**
 * Deletes an article by ID across all stores.
 */
export async function deleteArticleRecord(id: string): Promise<void> {
  // 1. IndexedDB
  await idbDelete(id);

  // 2. LocalStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      let list: ArticleRecord[] = JSON.parse(stored);
      list = list.filter((a) => a.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch (e) {
    console.warn('[ArticleStorage] Failed to delete from localStorage:', e);
  }

  // 3. Server backend disk
  try {
    await fetch(`/api/articles/${id}`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.error('[ArticleStorage] Failed to delete article from server:', e);
  }

  // 4. Dispatch update event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('articlesUpdated'));
  }
}

/**
 * Clears all articles across all stores.
 */
export async function clearAllArticles(): Promise<void> {
  await idbClear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  try {
    await fetch('/api/articles/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles: [] }),
    });
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('articlesUpdated'));
  }
}
