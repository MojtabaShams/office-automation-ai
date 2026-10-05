// تبدیل تاریخ میلادی به شمسی و برعکس (الگوریتم استاندارد jalaali)

function div(a: number, b: number) {
  return Math.trunc(a / b);
}

function jalCal(jy: number) {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
    2192, 2262, 2324, 2394, 2456, 3178,
  ];
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0]!;
  let jump = 0;
  let jm = 0;

  for (let i = 1; i < bl; i += 1) {
    const jm2 = breaks[i]!;
    jump = jm2 - jp;
    if (jy < jm2) {
      jm = i;
      break;
    }
    leapJ = leapJ + div(jump, 33) * 8 + div(jump % 33, 4);
    jp = jm2;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div((n % 33) + 3, 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = ((n + 1) % 33) % 4;
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number) {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * ((gm + 9) % 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(j % 1461, 4) * 5 + 308;
  const gd = div(i % 153, 5) + 1;
  const gm = (div(i, 153) % 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm: number;
  let jd: number;

  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = (k % 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = (k % 30) + 1;
  return { jy, jm, jd };
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

export function gregorianToJalali(date: Date) {
  const jdn = g2d(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const { jy, jm, jd } = d2j(jdn);
  return { year: jy, month: jm, day: jd };
}

export function jalaliToGregorian(jy: number, jm: number, jd: number) {
  const jdn = j2d(jy, jm, jd);
  const { gy, gm, gd } = d2g(jdn);
  return new Date(gy, gm - 1, gd);
}

export const jalaliMonthNames = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

export function formatJalali(date: Date) {
  const { year, month, day } = gregorianToJalali(date);
  return `${day} ${jalaliMonthNames[month - 1]} ${year}`;
}

/** برای گروه‌بندی/فیلتر کردن بر اساس ماه شمسی */
export function jalaliMonthKey(date: Date) {
  const { year, month } = gregorianToJalali(date);
  const mm = String(month).padStart(2, "0");
  return { key: `${year}-${mm}`, label: `${jalaliMonthNames[month - 1]} ${year}` };
}