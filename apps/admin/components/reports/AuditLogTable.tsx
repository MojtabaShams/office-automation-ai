"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type FilterFn,
} from "@tanstack/react-table";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronRight,
  ChevronLeft,
  Eye,
  RotateCcw,
} from "lucide-react";
import { useTheme } from "../../theme-context";
import JalaliDateRangeFilter, { type DateRangeValue } from "../JalaliDateRangeFilter";
import ThemedSelect from "../ThemedSelect";
import Modal from "../Modal";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "VIEW" | "LOGIN" | "RESTORE";

export type AuditLog = {
  id: number;
  userId: string;
  userName: string;
  action: AuditAction;
  module: string;
  recordId: string;
  oldValues: string | null;
  newValues: string | null;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
};

const actionLabel: Record<AuditAction, string> = {
  CREATE: "ثبت",
  UPDATE: "ویرایش",
  DELETE: "حذف",
  VIEW: "مشاهده",
  LOGIN: "ورود",
  RESTORE: "بازگردانی",
};

const actionColor: Record<AuditAction, string> = {
  CREATE: "bg-emerald-500/10 text-emerald-700",
  UPDATE: "bg-amber-500/10 text-amber-700",
  DELETE: "bg-rose-500/10 text-rose-700",
  VIEW: "bg-slate-500/10 text-slate-600",
  LOGIN: "bg-sky-500/10 text-sky-700",
  RESTORE: "bg-violet-500/10 text-violet-700",
};

const dateRangeFilterFn: FilterFn<AuditLog> = (row, columnId, filterValue: DateRangeValue) => {
  if (!filterValue) return true;
  const value = row.getValue(columnId) as Date;
  if (filterValue.from && value < filterValue.from) return false;
  if (filterValue.to && value > filterValue.to) return false;
  return true;
};

function formatTime(d: Date) {
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const sampleLogs: AuditLog[] = [
  {
    id: 1,
    userId: "emp-1",
    userName: "علی محمدی",
    action: "LOGIN",
    module: "AUTH",
    recordId: "—",
    oldValues: null,
    newValues: null,
    ipAddress: "192.168.1.10",
    userAgent: "Chrome / Windows",
    createdAt: new Date("2026-10-12T08:42:00"),
  },
  {
    id: 2,
    userId: "emp-2",
    userName: "سارا احمدی",
    action: "CREATE",
    module: "REQUESTS",
    recordId: "1045-1405",
    oldValues: null,
    newValues: '{"title":"درخواست مرخصی استحقاقی"}',
    ipAddress: "192.168.1.22",
    userAgent: "Chrome / macOS",
    createdAt: new Date("2026-10-12T09:18:00"),
  },
  {
    id: 3,
    userId: "emp-3",
    userName: "رضا کریمی",
    action: "UPDATE",
    module: "EMPLOYEES",
    recordId: "emp-5",
    oldValues: '{"role":"طراح UI"}',
    newValues: '{"role":"طراح ارشد UI"}',
    ipAddress: "192.168.1.35",
    userAgent: "Firefox / Windows",
    createdAt: new Date("2026-10-12T10:05:00"),
  },
  {
    id: 4,
    userId: "emp-1",
    userName: "علی محمدی",
    action: "DELETE",
    module: "FORMS",
    recordId: "form-12",
    oldValues: '{"name":"فرم درخواست تجهیزات","status":"active"}',
    newValues: null,
    ipAddress: "192.168.1.10",
    userAgent: "Chrome / Windows",
    createdAt: new Date("2026-10-12T10:32:00"),
  },
  {
    id: 5,
    userId: "emp-4",
    userName: "مینا رضایی",
    action: "VIEW",
    module: "REPORTS",
    recordId: "requests",
    oldValues: null,
    newValues: null,
    ipAddress: "192.168.1.48",
    userAgent: "Safari / iOS",
    createdAt: new Date("2026-10-12T11:10:00"),
  },
  {
    id: 6,
    userId: "emp-5",
    userName: "حسین نوری",
    action: "UPDATE",
    module: "PROCESSES",
    recordId: "proc-3",
    oldValues: '{"deadline":"2 روز کاری"}',
    newValues: '{"deadline":"3 روز کاری"}',
    ipAddress: "192.168.1.51",
    userAgent: "Chrome / Windows",
    createdAt: new Date("2026-10-11T15:40:00"),
  },
  {
    id: 7,
    userId: "emp-1",
    userName: "علی محمدی",
    action: "RESTORE",
    module: "FORMS",
    recordId: "form-12",
    oldValues: null,
    newValues: '{"name":"فرم درخواست تجهیزات","status":"active"}',
    ipAddress: "192.168.1.10",
    userAgent: "Chrome / Windows",
    createdAt: new Date("2026-10-12T12:00:00"),
  },
];

export default function AuditLogTable({ data = sampleLogs }: { data?: AuditLog[] }) {
  const { isDarkMode } = useTheme();
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [pageInput, setPageInput] = useState("1");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const columns = useMemo<ColumnDef<AuditLog>[]>(
    () => [
      {
        accessorKey: "id",
        header: "#",
        size: 60,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue() as number}</span>
        ),
      },
      {
        accessorKey: "userName",
        header: "کاربر",
        size: 140,
      },
      {
        accessorKey: "action",
        header: "عملیات",
        size: 110,
        cell: ({ getValue }) => {
          const action = getValue() as AuditAction;
          return (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${actionColor[action]}`}>
              {actionLabel[action]}
            </span>
          );
        },
        filterFn: (row, id, value) => {
          if (!value) return true;
          return row.getValue(id) === value;
        },
      },
      {
        accessorKey: "module",
        header: "ماژول",
        size: 120,
      },
      {
        accessorKey: "recordId",
        header: "شناسه رکورد",
        size: 120,
        cell: ({ getValue }) => (
          <span className="font-mono text-[0.7rem]">{String(getValue())}</span>
        ),
      },
      {
        accessorKey: "ipAddress",
        header: "IP",
        size: 120,
        cell: ({ getValue }) => (
          <span className="font-mono text-[0.7rem]" dir="ltr">
            {String(getValue())}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "زمان",
        size: 150,
        cell: ({ getValue }) => formatTime(getValue() as Date),
        filterFn: dateRangeFilterFn,
        sortingFn: (a, b) =>
          a.original.createdAt.getTime() - b.original.createdAt.getTime(),
      },
      {
        id: "actions",
        header: "اقدام",
        size: 160,
        enableSorting: false,
        enableColumnFilter: false,
        cell: ({ row }) => {
          const log = row.original;
          return (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(log);
                  setDetailOpen(true);
                }}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[0.65rem] font-semibold transition ${
                  isDarkMode
                    ? "border-white/15 bg-white/[0.06] hover:bg-white/10"
                    : "border-[#d5dad4] bg-white hover:bg-[#f3f5f1]"
                }`}
              >
                <Eye className="h-3 w-3" />
                جزئیات
              </button>
              {(log.action === "DELETE" || log.action === "UPDATE") && (
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-full border border-[#15554f]/30 bg-[#15554f]/10 px-2 py-1 text-[0.65rem] font-semibold text-[#15554f] transition hover:bg-[#15554f]/20"
                >
                  <RotateCcw className="h-3 w-3" />
                  بازگردانی
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [isDarkMode]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const pageCount = Math.max(table.getPageCount(), 1);
  const filteredCount = table.getFilteredRowModel().rows.length;

  useEffect(() => {
    setPageInput(String(pagination.pageIndex + 1));
  }, [pagination.pageIndex]);

  const goToPage = (value: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      setPageInput(String(pagination.pageIndex + 1));
      return;
    }
    const pageIndex = Math.min(pageCount, Math.max(1, parsed)) - 1;
    table.setPageIndex(pageIndex);
    setPageInput(String(pageIndex + 1));
  };

  const t = isDarkMode
    ? {
        wrap: "border-white/10 bg-[#193632]",
        head: "bg-[#193632] text-slate-200 border-white/10",
        row: "border-white/5 hover:bg-white/[0.03]",
        sub: "text-slate-400",
        input: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35",
        chip: "border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/10",
      }
    : {
        wrap: "border-[#d5dad4] bg-[#fafbf9]",
        head: "bg-[#edf0eb] text-[#40584e] border-[#d5dad4]",
        row: "border-[#e6e9e3] hover:bg-[#f6f7f4]",
        sub: "text-[#718074]",
        input: "border-[#d5dad4] bg-[#fafbf9] text-[#28443d] placeholder:text-[#8c9587]",
        chip: "border-[#d5dad4] bg-[#fafbf9] text-[#40584e] hover:bg-[#edf0eb]",
      };

  return (
    <>
      <div className={`rounded-2xl border ${t.wrap}`} dir="rtl">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-xs">
            <thead className={t.head}>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className={`border-b ${t.head}`}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={`select-none p-0 align-top ${t.head}`}
                    >
                      <div className="flex items-center justify-between gap-1 px-2 py-2">
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          disabled={!header.column.getCanSort()}
                          className="flex flex-1 items-center gap-1 text-right font-bold disabled:cursor-default"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() &&
                            (header.column.getIsSorted() === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            ))}
                        </button>
                      </div>

                      {header.column.getCanFilter() && (
                        <div className="px-2 pb-2">
                          {header.column.id === "createdAt" ? (
                            <JalaliDateRangeFilter
                              value={header.column.getFilterValue() as DateRangeValue}
                              onChange={(v) => header.column.setFilterValue(v)}
                            />
                          ) : header.column.id === "action" ? (
                            <ThemedSelect
                              value={(header.column.getFilterValue() as string) ?? ""}
                              onChange={(e) =>
                                header.column.setFilterValue(e.target.value || undefined)
                              }
                              className={`w-full rounded-lg border py-1 pl-7 pr-2 text-[0.7rem] ${t.input}`}
                              arrowClassName="left-1.5 h-3 w-3"
                            >
                              <option value="">همه</option>
                              <option value="CREATE">ثبت</option>
                              <option value="UPDATE">ویرایش</option>
                              <option value="DELETE">حذف</option>
                              <option value="VIEW">مشاهده</option>
                              <option value="LOGIN">ورود</option>
                              <option value="RESTORE">بازگردانی</option>
                            </ThemedSelect>
                          ) : (
                            <input
                              value={(header.column.getFilterValue() as string) ?? ""}
                              onChange={(e) => header.column.setFilterValue(e.target.value)}
                              placeholder="جستجو..."
                              className={`w-full rounded-lg border px-2 py-1 text-[0.7rem] outline-none ${t.input}`}
                            />
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={`border-b transition-colors ${t.row}`}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="break-words px-2 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className={`p-6 text-center ${t.sub}`}>
                    موردی یافت نشد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className={`flex flex-wrap items-center justify-between gap-3 border-t p-3 ${t.head}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs ${t.sub}`}>{filteredCount} مورد</span>
            <span className={`text-xs ${t.sub}`}>تعداد در صفحه:</span>
            <ThemedSelect
              value={pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className={`rounded-lg border py-1 pl-7 pr-2 text-xs ${t.input}`}
              arrowClassName={`left-2 h-3 w-3 ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}
            >
              {[10, 15, 25, 35].map((n) => (
                <option key={n} value={n} style={{ backgroundColor: "#fff", color: "#111827" }}>
                  {n}
                </option>
              ))}
            </ThemedSelect>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className={`rounded-lg border p-1.5 disabled:opacity-30 ${t.chip}`}
              aria-label="صفحه قبلی"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <span className={`text-xs ${t.sub}`}>صفحه :</span>
            <input
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => goToPage(pageInput)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  goToPage(pageInput);
                  e.currentTarget.blur();
                }
              }}
              className={`w-14 rounded-lg border px-2 py-1 text-center text-xs tabular-nums outline-none focus:border-[#15554f] ${t.input}`}
            />
            <span className={`text-xs ${t.sub}`}>از {pageCount}</span>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className={`rounded-lg border p-1.5 disabled:opacity-30 ${t.chip}`}
              aria-label="صفحه بعدی"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelected(null);
        }}
        title="جزئیات رویداد"
        maxWidthClass="max-w-lg"
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={`text-[0.65rem] ${t.sub}`}>کاربر</div>
                <div className="font-bold">{selected.userName}</div>
              </div>
              <div>
                <div className={`text-[0.65rem] ${t.sub}`}>عملیات</div>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${actionColor[selected.action]}`}>
                  {actionLabel[selected.action]}
                </span>
              </div>
              <div>
                <div className={`text-[0.65rem] ${t.sub}`}>ماژول</div>
                <div className="font-medium">{selected.module}</div>
              </div>
              <div>
                <div className={`text-[0.65rem] ${t.sub}`}>شناسه رکورد</div>
                <div className="font-mono text-xs">{selected.recordId}</div>
              </div>
              <div>
                <div className={`text-[0.65rem] ${t.sub}`}>IP</div>
                <div className="font-mono text-xs" dir="ltr">{selected.ipAddress}</div>
              </div>
              <div>
                <div className={`text-[0.65rem] ${t.sub}`}>زمان</div>
                <div className="text-xs">{formatTime(selected.createdAt)}</div>
              </div>
            </div>

            <div>
              <div className={`mb-1 text-[0.65rem] ${t.sub}`}>User Agent</div>
              <div className={`rounded-lg p-2 text-xs ${isDarkMode ? "bg-white/[0.04]" : "bg-[#f1eee5]"}`}>
                {selected.userAgent}
              </div>
            </div>

            {(selected.oldValues || selected.newValues) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className={`rounded-xl border p-3 ${isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>
                  <div className={`mb-1 text-[0.65rem] font-semibold ${t.sub}`}>old_values</div>
                  <pre className="whitespace-pre-wrap break-all font-mono text-[0.7rem]">
                    {selected.oldValues ?? "—"}
                  </pre>
                </div>
                <div className={`rounded-xl border p-3 ${isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>
                  <div className={`mb-1 text-[0.65rem] font-semibold ${t.sub}`}>new_values</div>
                  <pre className="whitespace-pre-wrap break-all font-mono text-[0.7rem]">
                    {selected.newValues ?? "—"}
                  </pre>
                </div>
              </div>
            )}

            {(selected.action === "DELETE" || selected.action === "UPDATE") && (
              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#15554f] bg-[#15554f] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#124740]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                بازگردانی به حالت قبل
              </button>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}