import { initialEmployees } from "./mock-employees";

export type RequestGroup = "active" | "completed" | "expired";
export type RequestSubStatus =
  | "registered"
  | "in-review"
  | "awaiting-user-documents"
  | "forwarded"
  | "approved"
  | "rejected"
  | "expired-user"
  | "escalation"
  | "cancelled";
export type RequestStageState = "approved" | "rejected" | "current" | "pending";
export type RequestDecision = "approved" | "rejected";

export type RequestStage = {
  id: string;
  title: string;
  assigneeId: string;
  slaDays: number;
  assignedAt?: string;
  state: RequestStageState;
  actedAt?: string;
  decision?: RequestDecision;
  note?: string;
};

export type RequestTimelineEntry = {
  id: string;
  action: string;
  actorId: string;
  at: string;
  description: string;
};

export type RequestChatMessage = {
  sender: "user" | "assistant";
  text: string;
  at: string;
};

export type RequestDocument = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  uploadedAt: string;
};

export type AdminRequest = {
  id: string;
  title: string;
  applicantName: string;
  applicantPhone: string;
  applicantEmail: string;
  createdAt: string;
  updatedAt: string;
  group: RequestGroup;
  subStatus: RequestSubStatus;
  processName: string;
  currentStageIndex: number;
  stages: RequestStage[];
  timeline: RequestTimelineEntry[];
  chat: RequestChatMessage[];
  documents?: RequestDocument[];
  evidenceDueAt?: string;
  satisfaction?: { score: number; comment: string };
};

export const CURRENT_MOCK_USER_ID = "emp-1";
export const REQUEST_STORAGE_KEY = "office-admin-requests-v1";

const employee = (id: string) => initialEmployees.find((item) => item.id === id)!;
const stage = (
  id: string,
  title: string,
  assigneeId: string,
  state: RequestStageState,
  actedAt?: string,
  decision?: RequestDecision,
  note?: string,
  slaDays = 3,
  assignedAt?: string
): RequestStage => ({
  id,
  title,
  assigneeId,
  state,
  actedAt,
  decision,
  note,
  slaDays,
  assignedAt,
});

const history = (
  id: string,
  action: string,
  actorId: string,
  at: string,
  description: string
): RequestTimelineEntry => ({ id, action, actorId, at, description });

const conversation: RequestChatMessage[] = [
  { sender: "user", text: "برای دریافت گواهی اشتغال به کار راهنمایی می‌خواهم.", at: "2026-10-01T08:30:00" },
  { sender: "assistant", text: "حتماً. این گواهی را برای چه منظوری نیاز دارید؟", at: "2026-10-01T08:30:18" },
  { sender: "user", text: "برای ارائه به بانک. اطلاعات هویتی و شماره تماس من در پرونده ثبت شده است.", at: "2026-10-01T08:31:02" },
  { sender: "assistant", text: "درخواست شما ثبت شد و برای بررسی به اداره ارجاع می‌شود.", at: "2026-10-01T08:31:20" },
];

const sampleDocumentImage =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><rect width="960" height="640" fill="#f5f7f4"/><rect x="32" y="32" width="896" height="576" rx="20" fill="#fff" stroke="#cbd5cf" stroke-width="4"/><path d="M100 140h340M100 190h690M100 240h650M100 330h240M100 390h500" stroke="#aab8af" stroke-width="18" stroke-linecap="round"/><rect x="100" y="470" width="220" height="72" rx="12" fill="#dcece3"/><text x="130" y="516" fill="#15554f" font-family="sans-serif" font-size="26">مدرک نمونه</text></svg>'
  );

const records: AdminRequest[] = [
  {
    id: "REQ-1405-1042",
    title: "صدور گواهی اشتغال به کار",
    applicantName: "نرگس موسوی",
    applicantPhone: "09123456780",
    applicantEmail: "n.mousavi@example.com",
    createdAt: "2026-10-01T08:31:00",
    updatedAt: "2026-10-03T10:15:00",
    group: "active",
    subStatus: "in-review",
    processName: "صدور گواهی اشتغال",
    currentStageIndex: 1,
    stages: [
      stage("s1", "ثبت و کنترل اولیه", "emp-2", "approved", "2026-10-02T09:12:00", "approved", "مدارک اولیه کامل است."),
      stage("s2", "بررسی منابع انسانی", "emp-1", "current", undefined, undefined, undefined, 4, "2026-10-02T09:12:00"),
      stage("s3", "تأیید مدیر واحد", "emp-4", "pending"),
      stage("s4", "صدور گواهی", "emp-10", "pending"),
    ],
    timeline: [
      history("h1", "ثبت درخواست", "emp-1", "2026-10-01T08:31:00", "درخواست از گفتگوی دستیار هوشمند دریافت شد."),
      history("h2", "ارجاع", "emp-1", "2026-10-01T08:40:00", "پرونده برای بررسی اولیه به سارا احمدی ارجاع شد."),
      history("h3", "تأیید مرحله", "emp-2", "2026-10-02T09:12:00", "مدارک اولیه کامل است؛ پرونده به مرحله منابع انسانی رفت."),
    ],
    chat: conversation,
    documents: [
      {
        id: "doc-1042-1",
        name: "تصویر کارت ملی - روی کارت.jpg",
        mimeType: "image/jpeg",
        url: sampleDocumentImage,
        uploadedAt: "2026-10-01T08:32:00",
      },
      {
        id: "doc-1042-2",
        name: "تصویر کارت ملی - پشت کارت.webp",
        mimeType: "image/webp",
        url: sampleDocumentImage,
        uploadedAt: "2026-10-01T08:33:00",
      },
    ],
  },
  {
    id: "REQ-1405-1043",
    title: "درخواست مرخصی استحقاقی",
    applicantName: "پیمان نادری",
    applicantPhone: "09121112233",
    applicantEmail: "p.naderi@example.com",
    createdAt: "2026-10-02T11:20:00",
    updatedAt: "2026-10-04T08:05:00",
    group: "active",
    subStatus: "escalation",
    processName: "رسیدگی به مرخصی",
    currentStageIndex: 1,
    stages: [
      stage("s1", "بررسی مانده مرخصی", "emp-2", "approved", "2026-10-02T13:05:00", "approved", "مانده مرخصی کافی است."),
      stage("s2", "تأیید سرپرست", "emp-3", "current", undefined, undefined, undefined, 1, "2026-10-02T08:00:00"),
      stage("s3", "ثبت در کارگزینی", "emp-1", "pending"),
    ],
    timeline: [
      history("h1", "ثبت درخواست", "emp-1", "2026-10-02T11:20:00", "درخواست مرخصی ثبت شد."),
      history("h2", "ارجاع", "emp-1", "2026-10-02T11:25:00", "پرونده برای کنترل مانده مرخصی ارجاع شد."),
      history("h3", "تأیید مرحله", "emp-2", "2026-10-02T13:05:00", "مانده مرخصی کافی است."),
      history("h4", "هشدار تأخیر و ارجاع به سرپرست", "emp-1", "2026-10-04T08:05:00", "مهلت اقدام مسئول فعلی به پایان رسیده؛ پرونده باز است و برای پیگیری به سرپرست ارجاع شده است."),
    ],
    chat: conversation,
  },
  {
    id: "REQ-1405-1044",
    title: "اصلاح اطلاعات پرسنلی",
    applicantName: "لیلا رستگار",
    applicantPhone: "09135556677",
    applicantEmail: "l. rastgar@example.com",
    createdAt: "2026-09-29T14:05:00",
    updatedAt: "2026-10-03T09:40:00",
    group: "active",
    subStatus: "awaiting-user-documents",
    processName: "اصلاح اطلاعات پرسنلی",
    currentStageIndex: 0,
    evidenceDueAt: "2026-10-08T23:59:00",
    stages: [
      stage("s1", "بررسی مدارک هویتی", "emp-1", "current", undefined, undefined, undefined, 5, "2026-09-29T14:05:00"),
      stage("s2", "اعمال اصلاحات", "emp-5", "pending"),
      stage("s3", "تأیید نهایی", "emp-4", "pending"),
    ],
    timeline: [
      history("h1", "ثبت درخواست", "emp-1", "2026-09-29T14:05:00", "درخواست اصلاح اطلاعات ثبت شد."),
      history("h2", "درخواست مدرک تکمیلی", "emp-1", "2026-10-03T09:40:00", "تصویر مدرک هویتی خوانا تا ۸ مهر بارگذاری شود."),
    ],
    chat: conversation,
  },
  {
    id: "REQ-1405-1045",
    title: "تخصیص تجهیزات اداری",
    applicantName: "سامان شریفی",
    applicantPhone: "09136667788",
    applicantEmail: "s.sharifi@example.com",
    createdAt: "2026-09-25T09:00:00",
    updatedAt: "2026-10-02T15:10:00",
    group: "active",
    subStatus: "forwarded",
    processName: "تخصیص تجهیزات",
    currentStageIndex: 2,
    stages: [
      stage("s1", "ثبت درخواست", "emp-1", "approved", "2026-09-25T10:00:00", "approved", "درخواست کامل است."),
      stage("s2", "بررسی موجودی", "emp-5", "approved", "2026-09-28T13:30:00", "approved", "تجهیزات موجود است."),
      stage("s3", "تأیید مدیر", "emp-4", "current", undefined, undefined, undefined, 2, "2026-09-28T13:35:00"),
      stage("s4", "تحویل تجهیزات", "emp-5", "pending"),
    ],
    timeline: [
      history("h1", "ثبت درخواست", "emp-1", "2026-09-25T09:00:00", "درخواست تخصیص تجهیزات ثبت شد."),
      history("h2", "تأیید موجودی", "emp-5", "2026-09-28T13:30:00", "تجهیزات مورد نیاز در انبار موجود است."),
      history("h3", "ارجاع به مرحله بعد", "emp-1", "2026-09-28T13:35:00", "برای تأیید مدیر واحد ارجاع شد."),
    ],
    chat: conversation,
  },
  {
    id: "REQ-1405-1046",
    title: "گواهی سابقه خدمت",
    applicantName: "مهدی اکبری",
    applicantPhone: "09137778899",
    applicantEmail: "m.akbari@example.com",
    createdAt: "2026-09-18T10:10:00",
    updatedAt: "2026-10-01T16:45:00",
    group: "completed",
    subStatus: "approved",
    processName: "صدور گواهی سابقه خدمت",
    currentStageIndex: 2,
    stages: [
      stage("s1", "بررسی پرونده", "emp-2", "approved", "2026-09-19T09:00:00", "approved", "سوابق تأیید شد."),
      stage("s2", "تأیید مدیر", "emp-4", "approved", "2026-09-20T11:00:00", "approved", "تأیید شد."),
      stage("s3", "صدور گواهی", "emp-1", "approved", "2026-10-01T16:45:00", "approved", "گواهی صادر و ارسال شد."),
    ],
    timeline: [
      history("h1", "ثبت درخواست", "emp-1", "2026-09-18T10:10:00", "درخواست گواهی ثبت شد."),
      history("h2", "تأیید مرحله", "emp-2", "2026-09-19T09:00:00", "سوابق تأیید شد."),
      history("h3", "تکمیل درخواست", "emp-1", "2026-10-01T16:45:00", "گواهی صادر و پرونده تکمیل شد."),
    ],
    chat: conversation,
    satisfaction: { score: 5, comment: "فرآیند سریع و شفاف بود." },
  },
  {
    id: "REQ-1405-1047",
    title: "درخواست مأموریت اداری",
    applicantName: "فرزانه رفیعی",
    applicantPhone: "09138889900",
    applicantEmail: "f.rafiei@example.com",
    createdAt: "2026-09-20T08:45:00",
    updatedAt: "2026-09-27T12:20:00",
    group: "completed",
    subStatus: "rejected",
    processName: "رسیدگی به مأموریت",
    currentStageIndex: 1,
    stages: [
      stage("s1", "بررسی مدارک مأموریت", "emp-1", "approved", "2026-09-22T10:30:00", "approved", "مدارک کامل است."),
      stage("s2", "تصمیم مدیر واحد", "emp-4", "rejected", "2026-09-27T12:20:00", "rejected", "بودجه مأموریت در این بازه تأیید نشد."),
      stage("s3", "ثبت نهایی", "emp-1", "pending"),
    ],
    timeline: [
      history("h1", "ثبت درخواست", "emp-1", "2026-09-20T08:45:00", "درخواست مأموریت ثبت شد."),
      history("h2", "رد نهایی", "emp-4", "2026-09-27T12:20:00", "بودجه مأموریت در این بازه تأیید نشد."),
    ],
    chat: conversation,
  },
  {
    id: "REQ-1405-1048",
    title: "درخواست وام ضروری",
    applicantName: "مینا جعفری",
    applicantPhone: "09139990011",
    applicantEmail: "m.jafari@example.com",
    createdAt: "2026-09-10T12:00:00",
    updatedAt: "2026-09-20T23:59:00",
    group: "expired",
    subStatus: "expired-user",
    processName: "بررسی وام ضروری",
    currentStageIndex: 0,
    evidenceDueAt: "2026-09-20T23:59:00",
    stages: [
      stage("s1", "دریافت مدارک مالی", "emp-11", "current", undefined, undefined, undefined, 4, "2026-09-15T10:00:00"),
      stage("s2", "بررسی شرایط وام", "emp-11", "pending"),
      stage("s3", "تصویب کمیته مالی", "emp-4", "pending"),
    ],
    timeline: [
      history("h1", "ثبت درخواست", "emp-1", "2026-09-10T12:00:00", "درخواست وام ثبت شد."),
      history("h2", "درخواست مدرک", "emp-11", "2026-09-15T10:00:00", "فیش حقوقی و گردش حساب درخواست شد."),
      history("h3", "بسته‌شدن با انقضای مهلت", "emp-1", "2026-09-20T23:59:00", "مدارک در مهلت تعیین‌شده از سوی متقاضی تکمیل نشد."),
    ],
    chat: conversation,
  },
  {
    id: "REQ-1405-1049",
    title: "درخواست تغییر شیفت",
    applicantName: "آرمان یوسفی",
    applicantPhone: "09130001122",
    applicantEmail: "a.yousefi@example.com",
    createdAt: "2026-10-03T09:10:00",
    updatedAt: "2026-10-03T09:10:00",
    group: "active",
    subStatus: "registered",
    processName: "تغییر برنامه کاری",
    currentStageIndex: 0,
    stages: [
      stage("s1", "بررسی اولیه", "emp-1", "current", undefined, undefined, undefined, 3, "2026-10-03T09:10:00"),
      stage("s2", "هماهنگی سرپرست", "emp-4", "pending"),
      stage("s3", "ثبت برنامه جدید", "emp-10", "pending"),
    ],
    timeline: [history("h1", "ثبت درخواست", "emp-1", "2026-10-03T09:10:00", "درخواست جدید در انتظار بررسی اولیه است.")],
    chat: conversation,
  },
  {
    id: "REQ-1405-1050",
    title: "درخواست بازگشت به کار",
    applicantName: "شبنم عباسی",
    applicantPhone: "09131112244",
    applicantEmail: "s.abbasi@example.com",
    createdAt: "2026-10-02T15:30:00",
    updatedAt: "2026-10-04T09:00:00",
    group: "active",
    subStatus: "in-review",
    processName: "بازگشت به کار",
    currentStageIndex: 1,
    stages: [
      stage("s1", "بررسی پرونده پرسنلی", "emp-2", "approved", "2026-10-03T10:00:00", "approved", "پرونده بررسی شد."),
      stage("s2", "بررسی حقوقی", "emp-7", "current", undefined, undefined, undefined, 3, "2026-10-03T10:00:00"),
      stage("s3", "تصمیم نهایی", "emp-4", "pending"),
    ],
    timeline: [
      history("h1", "ثبت درخواست", "emp-1", "2026-10-02T15:30:00", "درخواست بازگشت به کار ثبت شد."),
      history("h2", "تأیید مرحله", "emp-2", "2026-10-03T10:00:00", "پرونده پرسنلی کامل است."),
    ],
    chat: conversation,
  },
  {
    id: "REQ-1405-1051",
    title: "درخواست لغو خدمات",
    applicantName: "کیوان زمانی",
    applicantPhone: "09132223355",
    applicantEmail: "k.zamani@example.com",
    createdAt: "2026-09-30T13:15:00",
    updatedAt: "2026-10-01T09:00:00",
    group: "completed",
    subStatus: "cancelled",
    processName: "لغو خدمات اداری",
    currentStageIndex: 0,
    stages: [
      stage("s1", "ثبت لغو", "emp-1", "rejected", "2026-10-01T09:00:00", "rejected", "پرونده بنا به درخواست متقاضی لغو شد."),
    ],
    timeline: [
      history("h1", "ثبت درخواست", "emp-1", "2026-09-30T13:15:00", "درخواست خدمات ثبت شد."),
      history("h2", "لغو توسط کاربر", "emp-1", "2026-10-01T09:00:00", "متقاضی پیش از رسیدگی درخواست را لغو کرد."),
    ],
    chat: conversation,
  },
];

export const initialRequests: AdminRequest[] = records.map((request) => ({
  ...request,
  stages: request.stages.map((item) => ({ ...item })),
  timeline: request.timeline.map((item) => ({ ...item })),
  chat: (() => {
    const createdAt = new Date(request.createdAt);
    const time = (seconds: number) => new Date(createdAt.getTime() + seconds * 1000).toISOString();
    return [
      { sender: "user" as const, text: `برای «${request.title}» درخواست دارم. لطفاً راهنمایی کنید.`, at: time(0) },
      { sender: "assistant" as const, text: "حتماً. اطلاعات و مدارک مربوط به درخواست را در اختیار دارید؟", at: time(18) },
      { sender: "user" as const, text: "بله، اطلاعات لازم را ثبت کرده‌ام. لطفاً درخواست را برای بررسی ارسال کنید.", at: time(62) },
      { sender: "assistant" as const, text: `درخواست شما با شماره ${formatRequestId(request.id)} ثبت شد و برای رسیدگی به گردش کار ارجاع می‌شود.`, at: time(80) },
    ];
  })(),
  documents: request.documents?.map((document) => ({ ...document })),
}));

export function getEmployeeName(id: string) {
  return employee(id)?.fullName ?? "کارمند نامشخص";
}

export const REQUEST_STATUS_LABELS: Record<RequestSubStatus, string> = {
  registered: "ثبت‌شده، در انتظار ارجاع",
  "in-review": "نزد کارمند (در حال بررسی)",
  "awaiting-user-documents": "در انتظار تکمیل مدرک از کاربر",
  forwarded: "ارجاع‌شده به مرحله‌ی بعد",
  approved: "تأییدشده",
  rejected: "ردشده",
  "expired-user": "بسته‌شده؛ مهلت کاربر منقضی شد",
  escalation: "نیازمند پیگیری سرپرست",
  cancelled: "لغوشده توسط کاربر",
};

export function formatRequestDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function formatRequestId(id: string) {
  const number = id.replace(/^REQ-/, "").replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)] ?? digit);
  return `شماره پرونده ${number}`;
}

export function daysRemaining(deadline: string) {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
}

export function saveRequests(requests: AdminRequest[]) {
  window.localStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify(requests));
}

export function escalateOverdueRequests(requests: AdminRequest[], now = new Date()) {
  let changed = false;
  const next = requests.map((request) => {
    if (request.group !== "active" || request.subStatus === "escalation") return request;
    if (
      request.subStatus === "awaiting-user-documents" &&
      request.evidenceDueAt &&
      new Date(request.evidenceDueAt).getTime() < now.getTime()
    ) {
      changed = true;
      const at = now.toISOString();
      return {
        ...request,
        group: "expired" as const,
        subStatus: "expired-user" as const,
        updatedAt: at,
        timeline: [
          ...request.timeline,
          {
            id: `user-expiry-${request.id}-${at}`,
            action: "بسته‌شدن با انقضای مهلت",
            actorId: CURRENT_MOCK_USER_ID,
            at,
            description: "مدرک تکمیلی در مهلت تعیین‌شده از سوی متقاضی تکمیل نشد؛ پرونده بسته شد.",
          },
        ],
      };
    }
    if (request.subStatus === "awaiting-user-documents") return request;
    const currentStage = request.stages[request.currentStageIndex];
    if (!currentStage || currentStage.state !== "current") return request;
    const dueAt = new Date(currentStage.assignedAt ?? request.updatedAt);
    dueAt.setDate(dueAt.getDate() + currentStage.slaDays);
    if (dueAt.getTime() >= now.getTime()) return request;

    changed = true;
    const at = now.toISOString();
    return {
      ...request,
      subStatus: "escalation" as const,
      updatedAt: at,
      timeline: [
        ...request.timeline,
        {
          id: `escalation-${request.id}-${at}`,
          action: "هشدار تأخیر و ارجاع به سرپرست",
          actorId: CURRENT_MOCK_USER_ID,
          at,
          description: `مهلت اقدام ${getEmployeeName(currentStage.assigneeId)} در مرحله «${currentStage.title}» پایان یافت؛ هشدار تأخیر ثبت شد و پرونده برای پیگیری به سرپرست ارجاع شد.`,
        },
      ],
    };
  });
  return { requests: next, changed };
}
