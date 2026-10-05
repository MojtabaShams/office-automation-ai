export const ALL_EMPLOYEES_CONVERSATION_ID = "all-employees";

export type ChatAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  attachments: ChatAttachment[];
  sentAt: string;
  editedAt?: string;
  readBy: string[];
};

const DATABASE_NAME = "office-admin-messages";
const DATABASE_VERSION = 1;
const MESSAGE_STORE = "messages";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("ذخیره‌سازی پیام در این مرورگر در دسترس نیست."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MESSAGE_STORE)) {
        database.createObjectStore(MESSAGE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("باز کردن فضای ذخیره پیام‌ها ناموفق بود."));
    request.onblocked = () =>
      reject(new Error("فضای ذخیره پیام‌ها توسط یک زبانه دیگر قفل شده است."));
  });
}

export async function loadChatMessages(): Promise<ChatMessage[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MESSAGE_STORE, "readonly");
    const request = transaction.objectStore(MESSAGE_STORE).getAll() as IDBRequest<ChatMessage[]>;
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("خواندن پیام‌های ذخیره‌شده ناموفق بود."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("خواندن پیام‌ها ناموفق بود."));
    };
  });
}

export async function saveChatMessages(messages: ChatMessage[]): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MESSAGE_STORE, "readwrite");
    const store = transaction.objectStore(MESSAGE_STORE);
    store.clear();
    messages.forEach((message) => store.put(message));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("ذخیره پیام‌ها ناموفق بود."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("ذخیره پیام‌ها لغو شد."));
    };
  });
}
