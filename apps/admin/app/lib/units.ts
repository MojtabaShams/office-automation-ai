export type UnitCategoryId =
  | "area"
  | "length"
  | "weight"
  | "currency"
  | "count"
  | "time"
  | "percentage";

export type UnitDefinition = {
  id: string;
  label: string;
};

export type UnitCategory = {
  id: UnitCategoryId;
  label: string;
  units: readonly UnitDefinition[];
};

export const UNIT_CATEGORIES: readonly UnitCategory[] = [
  {
    id: "area",
    label: "مساحت",
    units: [
      { id: "square-meter", label: "متر مربع" },
      { id: "hectare", label: "هکتار" },
    ],
  },
  {
    id: "length",
    label: "طول",
    units: [
      { id: "millimeter", label: "میلی‌متر" },
      { id: "centimeter", label: "سانتی‌متر" },
      { id: "meter", label: "متر" },
      { id: "kilometer", label: "کیلومتر" },
    ],
  },
  {
    id: "weight",
    label: "وزن",
    units: [
      { id: "gram", label: "گرم" },
      { id: "kilogram", label: "کیلوگرم" },
      { id: "ton", label: "تن" },
    ],
  },
  {
    id: "currency",
    label: "مبلغ",
    units: [
      { id: "rial", label: "ریال" },
      { id: "toman", label: "تومان" },
    ],
  },
  {
    id: "count",
    label: "تعداد / نفر",
    units: [
      { id: "person", label: "نفر" },
      { id: "item", label: "عدد" },
    ],
  },
  {
    id: "time",
    label: "زمان",
    units: [
      { id: "day", label: "روز" },
      { id: "month", label: "ماه" },
      { id: "year", label: "سال" },
    ],
  },
  {
    id: "percentage",
    label: "درصد",
    units: [{ id: "percent", label: "درصد" }],
  },
] as const;

export const UNIT_LABELS = Object.fromEntries(
  UNIT_CATEGORIES.flatMap((category) =>
    category.units.flatMap((unit) => [
      [unit.id, unit.label] as const,
      [unit.label, unit.label] as const,
    ]),
  ),
) as Record<string, string>;

export function getUnitCategoryId(unitId: string | undefined): UnitCategoryId | undefined {
  if (!unitId) return undefined;
  return UNIT_CATEGORIES.find((category) =>
    category.units.some((unit) => unit.id === unitId || unit.label === unitId),
  )?.id;
}
