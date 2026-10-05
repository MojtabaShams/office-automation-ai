import type { Employee } from "./mock-employees";

export type CalendarEventType = "system" | "task" | "public-request";

export type CalendarEvent = {
  id: string;
  type: CalendarEventType;
  createdBy: string;
  recipientIds: string[];
  subject: string;
  description: string;
  createdAt: string;
  startsAt: string;
  endsAt: string;
};

const DATABASE_NAME = "office-admin-calendar";
const DATABASE_VERSION = 1;
const EVENT_STORE = "events";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("ذخیره‌سازی تقویم در این مرورگر در دسترس نیست."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(EVENT_STORE)) {
        request.result.createObjectStore(EVENT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("باز کردن فضای ذخیره تقویم ناموفق بود."));
    request.onblocked = () =>
      reject(new Error("فضای ذخیره تقویم توسط یک زبانه دیگر قفل شده است."));
  });
}

export async function loadCalendarEvents(): Promise<CalendarEvent[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(EVENT_STORE, "readonly");
    const request = transaction.objectStore(EVENT_STORE).getAll() as IDBRequest<CalendarEvent[]>;
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("خواندن رویدادهای تقویم ناموفق بود."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("خواندن رویدادهای تقویم ناموفق بود."));
    };
  });
}

export async function saveCalendarEvent(event: CalendarEvent): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(EVENT_STORE, "readwrite");
    transaction.objectStore(EVENT_STORE).put(event);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("ذخیره رویداد تقویم ناموفق بود."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("ذخیره رویداد تقویم لغو شد."));
    };
  });
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(EVENT_STORE, "readwrite");
    transaction.objectStore(EVENT_STORE).delete(eventId);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("حذف رویداد تقویم ناموفق بود."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("حذف رویداد تقویم لغو شد."));
    };
  });
}

export async function recordSystemEvent({
  actorId,
  subject,
  description,
  employees,
}: {
  actorId: string;
  subject: string;
  description: string;
  employees: Employee[];
}): Promise<void> {
  const now = new Date();
  await saveCalendarEvent({
    id: crypto.randomUUID(),
    type: "system",
    createdBy: actorId,
    recipientIds: employees.map((employee) => employee.id),
    subject,
    description,
    createdAt: now.toISOString(),
    startsAt: now.toISOString(),
    endsAt: now.toISOString(),
  });
}
