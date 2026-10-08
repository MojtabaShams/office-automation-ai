"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  type ColumnSizingState,
  type VisibilityState,
  type FilterFn,
  type OnChangeFn,
} from "@tanstack/react-table";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Download,
  FileSpreadsheet,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { useTheme } from "../theme-context";
import { Employee, AccessLevel } from "../app/lib/mock-employees";
import { formatJalali } from "../app/lib/jalali";
import JalaliDateRangeFilter, { DateRangeValue } from "./JalaliDateRangeFilter";
import ThemedSelect from "./ThemedSelect";

const dateRangeFilterFn: FilterFn<Employee> = (row, columnId, filterValue: DateRangeValue) => {
  if (!filterValue) return true;
  const value = row.getValue(columnId) as Date;
  if (filterValue.from && value < filterValue.from) return false;
  if (filterValue.to && value > filterValue.to) return false;
  return true;
};

const globalFilterFn: FilterFn<Employee> = (row, _columnId, filterValue) => {
  const search = String(filterValue ?? "").toLowerCase();
  if (!search) return true;
  return row.getVisibleCells().some((cell) => {
    const value = getCellText(row.original, cell.column.id, cell.getValue());
    return value.toLowerCase().includes(search);
  });
};

function getCellText(employee: Employee, columnId: string, value: unknown) {
  if (columnId === "select") return "";
  if (columnId === "status") return employee.status === "active" ? "فعال" : "غیرفعال";
  if (columnId === "hireDate") return formatJalali(employee.hireDate);
  return String(value ?? "");
}

function countMatches(text: string, query: string) {
  if (!query) return 0;
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  let count = 0;
  let index = 0;
  while (true) {
    const found = normalizedText.indexOf(normalizedQuery, index);
    if (found === -1) return count;
    count += 1;
    index = found + normalizedQuery.length;
  }
}

function HighlightedText({
  text,
  query,
  startIndex,
  activeIndex,
  registerRef,
}: {
  text: string;
  query: string;
  startIndex: number;
  activeIndex: number;
  registerRef: (index: number, element: HTMLElement | null) => void;
}) {
  if (!query) return <>{text}</>;

  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let localIndex = 0;

  while (true) {
    const found = normalizedText.indexOf(normalizedQuery, cursor);
    if (found === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (found > cursor) parts.push(text.slice(cursor, found));

    const matchIndex = startIndex + localIndex;
    localIndex += 1;
    parts.push(
      <mark
        key={`${matchIndex}-${found}`}
        ref={(element) => registerRef(matchIndex, element)}
        className={
          matchIndex === activeIndex
            ? "rounded bg-orange-400 px-0.5 text-black"
            : "rounded bg-yellow-300/70 px-0.5 text-black"
        }
      >
        {text.slice(found, found + query.length)}
      </mark>
    );
    cursor = found + query.length;
  }

  return <>{parts}</>;
}

export default function EmployeeTable({
  data,
  accessLevels,
  globalFilter,
  selectedId,
  onSelect,
  columnVisibility,
  onColumnVisibilityChange,
  onFilteredCountChange,
  onImportClick,
  activeMatch,
  onActiveMatchChange,
  onMatchCountChange,
  stickyHeaderTop,
}: {
  data: Employee[];
  accessLevels: AccessLevel[];
  globalFilter: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
  onFilteredCountChange: (count: number) => void;
  onImportClick: () => void;
  activeMatch: number;
  onActiveMatchChange: (index: number) => void;
  onMatchCountChange: (count: number) => void;
  stickyHeaderTop: number;
}) {
  const { isDarkMode } = useTheme();

  const accessLevelName = (id: string) => accessLevels.find((l) => l.id === id)?.name ?? "—";

  const columns = useMemo<ColumnDef<Employee>[]>(
    () => [
      {
        id: "select",
        header: "",
        size: 48,
        minSize: 40,
        maxSize: 72,
        enableSorting: false,
        enableColumnFilter: false,
        enableResizing: true,
        cell: ({ row }) => (
          <input
            type="radio"
            name="employee-row"
            checked={selectedId === row.original.id}
            onChange={() => onSelect(selectedId === row.original.id ? null : row.original.id)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 accent-[#15554f]"
          />
        ),
      },
      {
        accessorKey: "fullName",
        header: "نام و نام خانوادگی",
        size: 170,
        minSize: 120,
        maxSize: 360,
      },
      { accessorKey: "email", header: "ایمیل", size: 190, minSize: 130, maxSize: 400 },
      { accessorKey: "phone", header: "شماره تماس", size: 130, minSize: 100, maxSize: 280 },
      { accessorKey: "role", header: "نقش شغلی", size: 145, minSize: 105, maxSize: 320 },
      {
        id: "accessLevel",
        accessorFn: (row) => accessLevelName(row.accessLevelId),
        header: "سطح دسترسی",
        size: 135,
        minSize: 100,
        maxSize: 300,
      },
      {
        accessorKey: "status",
        header: "وضعیت",
        size: 100,
        minSize: 80,
        maxSize: 200,
        cell: ({ getValue }) => {
          const isActive = getValue() === "active";
          const activeCls = isDarkMode
            ? "bg-teal-400/15 text-teal-300"
            : "bg-[#e4f1e8] text-[#246348]";
          const inactiveCls = isDarkMode
            ? "bg-[#c96f63]/15 text-[#f0a092]"
            : "bg-[#fff0e9] text-[#a44f46]";
          return (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem] font-medium ${
                isActive ? activeCls : inactiveCls
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isActive ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              {isActive ? "فعال" : "غیرفعال"}
            </span>
          );
        },
      },
      {
        accessorKey: "hireDate",
        header: "تاریخ استخدام",
        size: 155,
        minSize: 115,
        maxSize: 300,
        cell: ({ getValue }) => formatJalali(getValue() as Date),
        filterFn: dateRangeFilterFn,
        sortingFn: (a, b) =>
          (a.original.hireDate as Date).getTime() - (b.original.hireDate as Date).getTime(),
      },
    ],
    [accessLevels, selectedId, isDarkMode]
  );

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [pageInput, setPageInput] = useState("1");
  const matchRefs = useRef<Record<number, HTMLElement | null>>({});

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnSizing,
      globalFilter,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange,
    onColumnSizingChange: (updater) => {
      setColumnSizing((previous) => {
        const requested = typeof updater === "function" ? updater(previous) : updater;
        const visibleColumns = table.getVisibleLeafColumns();
        const changedColumn = visibleColumns.find(
          (column) =>
            (requested[column.id] ?? column.getSize()) !==
            (previous[column.id] ?? column.getSize())
        );

        if (!changedColumn) return requested;

        const index = visibleColumns.indexOf(changedColumn);
        const adjacentColumn = visibleColumns[index + 1] ?? visibleColumns[index - 1];
        if (!adjacentColumn) return requested;

        const currentSize = previous[changedColumn.id] ?? changedColumn.getSize();
        const adjacentSize = previous[adjacentColumn.id] ?? adjacentColumn.getSize();
        const requestedDelta =
          (requested[changedColumn.id] ?? currentSize) - currentSize;
        const minDelta = Math.max(
          changedColumn.columnDef.minSize! - currentSize,
          adjacentSize - adjacentColumn.columnDef.maxSize!
        );
        const maxDelta = Math.min(
          changedColumn.columnDef.maxSize! - currentSize,
          adjacentSize - adjacentColumn.columnDef.minSize!
        );
        const delta = Math.min(maxDelta, Math.max(minDelta, requestedDelta));

        return {
          ...previous,
          [changedColumn.id]: currentSize + delta,
          [adjacentColumn.id]: adjacentSize - delta,
        };
      });
    },
    onPaginationChange: setPagination,
    columnResizeMode: "onChange",
    columnResizeDirection: "rtl",
    enableColumnResizing: true,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const visibleColumnSize = table
    .getVisibleLeafColumns()
    .reduce((total, column) => total + column.getSize(), 0);
  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = Math.max(table.getPageCount(), 1);
  const searchableRows = table.getSortedRowModel().rows;
  const matchLayout = useMemo(() => {
    const byCell = new Map<string, { startIndex: number }>();
    const rowIndices: number[] = [];
    let total = 0;

    if (!globalFilter) return { byCell, rowIndices, total };

    searchableRows.forEach((row, rowIndex) => {
      row.getVisibleCells().forEach((cell) => {
        const text = getCellText(row.original, cell.column.id, cell.getValue());
        const count = countMatches(text, globalFilter);
        if (count === 0) return;

        byCell.set(cell.id, { startIndex: total });
        for (let index = 0; index < count; index += 1) rowIndices.push(rowIndex);
        total += count;
      });
    });

    return { byCell, rowIndices, total };
  }, [searchableRows, globalFilter, columnVisibility, accessLevels]);
  const totalMatches = matchLayout.total;

  useEffect(() => {
    onFilteredCountChange(filteredCount);
  }, [filteredCount, onFilteredCountChange]);

  useEffect(() => {
    onMatchCountChange(totalMatches);
    if (activeMatch >= totalMatches) onActiveMatchChange(0);
  }, [activeMatch, onActiveMatchChange, onMatchCountChange, totalMatches]);

  useEffect(() => {
    onActiveMatchChange(0);
  }, [columnFilters, columnVisibility, onActiveMatchChange, sorting]);

  useEffect(() => {
    if (!globalFilter || totalMatches === 0) return;

    const rowIndex = matchLayout.rowIndices[activeMatch];
    if (rowIndex === undefined) return;
    const targetPage = Math.floor(rowIndex / pagination.pageSize);
    if (targetPage !== pagination.pageIndex) {
      table.setPageIndex(targetPage);
      return;
    }

    const element = matchRefs.current[activeMatch];
    const container = document.getElementById("admin-main-scroll");
    if (!element || !container) return;

    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const targetTop =
      container.scrollTop +
      (elementRect.top - containerRect.top) -
      container.clientHeight / 2 +
      elementRect.height / 2;
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [
    activeMatch,
    globalFilter,
    matchLayout,
    pagination.pageIndex,
    pagination.pageSize,
    table,
    totalMatches,
  ]);

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

  const exportToExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const headers = [
        "نام و نام خانوادگی",
        "ایمیل",
        "شماره تماس",
        "نقش شغلی",
        "سطح دسترسی",
        "وضعیت",
        "تاریخ استخدام",
      ];
      const rows = table.getFilteredRowModel().rows.map(({ original }) => [
        original.fullName,
        original.email,
        original.phone,
        original.role,
        accessLevelName(original.accessLevelId),
        original.status === "active" ? "فعال" : "غیرفعال",
        formatJalali(original.hireDate),
      ]);
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "کارمندان");
      XLSX.writeFile(workbook, "employees.xlsx");
    } catch (error) {
      console.error("خروجی گرفتن فایل Excel ناموفق بود:", error);
      window.alert("ساخت فایل Excel با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
    }
  };

  const t = isDarkMode
    ? {
        wrap: "border-white/10 bg-[#193632]",
        head: "bg-white/[0.04] text-slate-200 border-white/10",
        row: "border-white/5 hover:bg-white/[0.03]",
        rowSelected: "bg-[#15554f]/25",
        sub: "text-slate-400",
        input: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35",
        chip: "border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/10",
        panel: "border-white/10 bg-[#17332f] text-white",
      }
    : {
        wrap: "border-[#d5dad4] bg-[#fafbf9]",
        head: "bg-[#edf0eb] text-[#40584e] border-[#d5dad4]",
        row: "border-[#e6e9e3] hover:bg-[#f6f7f4]",
        rowSelected: "bg-[#e2eee8]",
        sub: "text-[#718074]",
        input: "border-[#d5dad4] bg-[#fafbf9] text-[#28443d] placeholder:text-[#8c9587]",
        chip: "border-[#d5dad4] bg-[#fafbf9] text-[#40584e] hover:bg-[#edf0eb]",
        panel: "border-[#d5dad4] bg-[#fafbf9] text-[#28443d]",
      };

  return (
    <div className={`rounded-2xl border ${t.wrap}`} dir="rtl">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-xs">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className={`border-b ${t.head}`}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{
                      width: `${(header.getSize() / visibleColumnSize) * 100}%`,
                      position: "sticky",
                      top: stickyHeaderTop,
                      zIndex: 20,
                    }}
                    className={`select-none p-0 align-top ${t.head}`}
                  >
                    <div className="flex items-center justify-between gap-1 px-2 py-2">
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        disabled={!header.column.getCanSort()}
                        className="flex flex-1 items-center gap-1 text-right font-bold"
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
                        {header.column.id === "hireDate" ? (
                          <JalaliDateRangeFilter
                            value={header.column.getFilterValue() as DateRangeValue}
                            onChange={(v) => header.column.setFilterValue(v)}
                          />
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

                    {header.column.getCanResize() && (
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`تغییر اندازه ستون ${String(header.column.columnDef.header ?? "")}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          header.getResizeHandler()(event);
                        }}
                        onTouchStart={(event) => {
                          event.stopPropagation();
                          header.getResizeHandler()(event);
                        }}
                        onDoubleClick={() => header.column.resetSize()}
                        onDragStart={(event) => event.preventDefault()}
                        className="absolute left-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none select-none after:absolute after:left-[3px] after:top-0 after:h-full after:w-px after:bg-transparent hover:after:bg-[#15554f]/50"
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onSelect(selectedId === row.original.id ? null : row.original.id)}
                className={`cursor-pointer border-b transition-colors ${t.row} ${
                  selectedId === row.original.id ? t.rowSelected : ""
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={{ width: `${(cell.column.getSize() / visibleColumnSize) * 100}%` }}
                    className="break-words px-2 py-2.5"
                  >
                    {cell.column.id === "select" ? (
                      flexRender(cell.column.columnDef.cell, cell.getContext())
                    ) : cell.column.id === "status" ? (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem] font-medium ${
                          row.original.status === "active"
                            ? isDarkMode
                              ? "bg-teal-400/15 text-teal-300"
                              : "bg-teal-50 text-teal-800"
                            : isDarkMode
                              ? "bg-[#c96f63]/15 text-[#f0a092]"
                              : "bg-[#fff0e9] text-[#a44f46]"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            row.original.status === "active" ? "bg-emerald-500" : "bg-red-500"
                          }`}
                        />
                        <HighlightedText
                          text={getCellText(row.original, cell.column.id, cell.getValue())}
                          query={globalFilter}
                          startIndex={matchLayout.byCell.get(cell.id)?.startIndex ?? 0}
                          activeIndex={activeMatch}
                          registerRef={(index, element) => {
                            matchRefs.current[index] = element;
                          }}
                        />
                      </span>
                    ) : (
                      <HighlightedText
                        text={getCellText(row.original, cell.column.id, cell.getValue())}
                        query={globalFilter}
                        startIndex={matchLayout.byCell.get(cell.id)?.startIndex ?? 0}
                        activeIndex={activeMatch}
                        registerRef={(index, element) => {
                          matchRefs.current[index] = element;
                        }}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className={`p-6 text-center ${t.sub}`}>
                  موردی یافت نشد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-3 border-t p-3 ${t.head}`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onImportClick}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${t.chip}`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            ورود از Excel
          </button>
          <button
            type="button"
            onClick={exportToExcel}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${t.chip}`}
          >
            <Download className="h-3.5 w-3.5" />
            خروجی Excel
          </button>
          <span className={`text-xs ${t.sub}`}>تعداد در صفحه:</span>
          <ThemedSelect
            value={pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className={`rounded-lg border py-1 pl-7 pr-2 text-xs ${t.input}`}
            arrowClassName={`left-2 h-3 w-3 ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}
          >
            {[10, 15, 25, 35].map((n) => (
              <option
                key={n}
                value={n}
                style={{ backgroundColor: "#fff", color: "#111827" }}
              >
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
            pattern="[0-9]*"
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            onBlur={() => goToPage(pageInput)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                goToPage(pageInput);
                event.currentTarget.blur();
              }
            }}
            aria-label="شماره صفحه"
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
  );
}