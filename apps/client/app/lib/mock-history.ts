export type ConversationMessage = {
  role: "user" | "assistant";
  text: string;
};

export type Conversation = {
  id: string;
  title: string;
  snippet: string;
  date: Date;
  messages: ConversationMessage[];
};

// تاریخ مبنا ثابت است (نه new Date() لحظه‌ای) تا هنگام رندر سمت سرور و کلاینت
// مقدار یکسانی تولید شود و خطای hydration رخ ندهد.
const REFERENCE_NOW = new Date(2026, 8, 25, 12, 0, 0);

function daysAgo(n: number, hour = 10, minute = 0) {
  const d = new Date(REFERENCE_NOW);
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export const conversations: Conversation[] = [
  {
    id: "c1",
    title: "درخواست فرم پروانه ساختمان",
    snippet: "فرم پروانه ساختمان را برایم پیدا کن و راهنمایی کن چطور پرش کنم.",
    date: daysAgo(0, 9, 30),
    messages: [
      { role: "user", text: "فرم پروانه ساختمان را می‌خواهم." },
      {
        role: "assistant",
        text: "فرم پروانه ساختمان را پیدا کردم؛ می‌توانید آن را از این‌جا دانلود کنید.",
      },
    ],
  },
  {
    id: "c2",
    title: "پیگیری وضعیت مرخصی",
    snippet: "وضعیت درخواست مرخصی استعلاجی من به کجا رسیده است؟",
    date: daysAgo(1, 14, 5),
    messages: [
      { role: "user", text: "وضعیت مرخصی من چه شده؟" },
      { role: "assistant", text: "درخواست شما در مرحله تایید مدیر مستقیم است." },
    ],
  },
  {
    id: "c3",
    title: "راهنمای ثبت‌نام بیمه تکمیلی",
    snippet: "برای ثبت‌نام بیمه تکمیلی چه مدارکی لازم است؟",
    date: daysAgo(6, 11, 0),
    messages: [
      { role: "user", text: "مدارک ثبت‌نام بیمه تکمیلی چیست؟" },
      {
        role: "assistant",
        text: "شناسنامه، کارت ملی و آخرین فیش حقوقی برای ثبت‌نام لازم است.",
      },
    ],
  },
  {
    id: "c4",
    title: "سوال درباره مالیات بر ارزش افزوده",
    snippet: "نحوه محاسبه مالیات بر ارزش افزوده برای فاکتور فروش را توضیح بده.",
    date: daysAgo(13, 16, 20),
    messages: [
      { role: "user", text: "مالیات ارزش افزوده چطور محاسبه می‌شود؟" },
      { role: "assistant", text: "نرخ فعلی ۹ درصد روی مبلغ خالص فاکتور اعمال می‌شود." },
    ],
  },
  {
    id: "c5",
    title: "درخواست کپی مدرک تحصیلی",
    snippet: "می‌خواهم یک نسخه کپی برابر اصل از مدرک تحصیلی‌ام دریافت کنم.",
    date: daysAgo(35, 9, 0),
    messages: [
      { role: "user", text: "کپی برابر اصل مدرک تحصیلی چطور می‌گیرم؟" },
      { role: "assistant", text: "باید به اداره امور اداری مراجعه و فرم مربوطه را تکمیل کنید." },
    ],
  },
  {
    id: "c6",
    title: "پیگیری شکایت اداری",
    snippet: "شکایت ثبت‌شده درباره تاخیر در صدور مجوز را پیگیری کن.",
    date: daysAgo(50, 10, 45),
    messages: [
      { role: "user", text: "پیگیری شکایت من چه شده؟" },
      { role: "assistant", text: "پرونده شما در حال بررسی توسط بازرسی است." },
    ],
  },
  {
    id: "c7",
    title: "استعلام سوابق بیمه",
    snippet: "سوابق بیمه تامین اجتماعی من را استعلام بگیر.",
    date: daysAgo(70, 12, 0),
    messages: [
      { role: "user", text: "سوابق بیمه‌ام را می‌خواهم." },
      { role: "assistant", text: "سوابق بیمه شما ۸ سال و ۴ ماه ثبت شده است." },
    ],
  },
];