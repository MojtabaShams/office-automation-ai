export type Permission = {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
};

export type AccessLevel = {
  id: string;
  name: string;
  permissions: Record<string, Permission>;
};

export type Employee = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  accessLevelId: string;
  status: "active" | "inactive";
  hireDate: Date;
};

/** بخش‌های سیستم که سطح دسترسی می‌تواند رویشان کنترل داشته باشد (هماهنگ با منوی بالای پنل) */
export const CONTROL_MODULES = [
  { id: "employees", label: "کارمندان" },
  { id: "processes", label: "پروسه‌ها" },
  { id: "requests", label: "درخواست‌ها" },
  { id: "calendar", label: "تقویم کاری" },
  { id: "messages", label: "پیام‌ها" },
  { id: "reports", label: "گزارشات" },
];

const fullAccess = (): Record<string, Permission> =>
  Object.fromEntries(
    CONTROL_MODULES.map((m) => [m.id, { view: true, add: true, edit: true, delete: true }])
  );

const viewOnlyAccess = (): Record<string, Permission> =>
  Object.fromEntries(
    CONTROL_MODULES.map((m) => [m.id, { view: true, add: false, edit: false, delete: false }])
  );

export const initialAccessLevels: AccessLevel[] = [
  { id: "lvl-admin", name: "مدیر کل", permissions: fullAccess() },
  { id: "lvl-staff", name: "کارمند عادی", permissions: viewOnlyAccess() },
];

// تاریخ مبنا ثابت (نه new Date() لحظه‌ای) تا رندر سرور/کلاینت یکسان بماند
const REFERENCE_NOW = new Date(2026, 8, 25, 12, 0, 0);
function daysAgo(n: number) {
  const d = new Date(REFERENCE_NOW);
  d.setDate(d.getDate() - n);
  return d;
}

export const initialEmployees: Employee[] = [
  { id: "emp-1", fullName: "علی محمدی", email: "a.mohammadi@example.com", phone: "09121234567", role: "کارشناس اداری", accessLevelId: "lvl-admin", status: "active", hireDate: daysAgo(20) },
  { id: "emp-2", fullName: "سارا احمدی", email: "s.ahmadi@example.com", phone: "09123456789", role: "کارشناس منابع انسانی", accessLevelId: "lvl-staff", status: "active", hireDate: daysAgo(65) },
  { id: "emp-3", fullName: "رضا کریمی", email: "r.karimi@example.com", phone: "09131234567", role: "حسابدار", accessLevelId: "lvl-staff", status: "inactive", hireDate: daysAgo(140) },
  { id: "emp-4", fullName: "مریم حسینی", email: "m.hosseini@example.com", phone: "09141234567", role: "مدیر پروژه", accessLevelId: "lvl-admin", status: "active", hireDate: daysAgo(300) },
  { id: "emp-5", fullName: "حسین رضایی", email: "h.rezaei@example.com", phone: "09151234567", role: "کارشناس فناوری اطلاعات", accessLevelId: "lvl-staff", status: "active", hireDate: daysAgo(400) },
  { id: "emp-6", fullName: "فاطمه نوری", email: "f.nouri@example.com", phone: "09161234567", role: "کارشناس ارتباطات", accessLevelId: "lvl-staff", status: "active", hireDate: daysAgo(10) },
  { id: "emp-7", fullName: "محمد صادقی", email: "m.sadeghi@example.com", phone: "09171234567", role: "کارشناس حقوقی", accessLevelId: "lvl-admin", status: "inactive", hireDate: daysAgo(500) },
  { id: "emp-8", fullName: "زهرا کاظمی", email: "z.kazemi@example.com", phone: "09181234567", role: "کارشناس اداری", accessLevelId: "lvl-staff", status: "active", hireDate: daysAgo(50) },
  { id: "emp-9", fullName: "امیر تقوی", email: "a.taghavi@example.com", phone: "09191234567", role: "کارشناس آموزش", accessLevelId: "lvl-staff", status: "active", hireDate: daysAgo(90) },
  { id: "emp-10", fullName: "نگار جعفری", email: "n.jafari@example.com", phone: "09101234567", role: "مسئول دفتر", accessLevelId: "lvl-staff", status: "active", hireDate: daysAgo(200) },
  { id: "emp-11", fullName: "کیانوش رستمی", email: "k.rostami@example.com", phone: "09112345678", role: "کارشناس مالی", accessLevelId: "lvl-admin", status: "active", hireDate: daysAgo(15) },
  { id: "emp-12", fullName: "الهام یزدانی", email: "e.yazdani@example.com", phone: "09122345678", role: "کارشناس اداری", accessLevelId: "lvl-staff", status: "inactive", hireDate: daysAgo(250) },
];