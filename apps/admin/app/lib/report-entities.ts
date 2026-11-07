/**
 * Report data sources.
 *
 * Rows and field metadata come from ``GET /api/admin/reports/entities``, which the
 * backend aggregates straight from PostgreSQL (users + submissions). The list is
 * cached in memory so the synchronous report engine (``runReport``) keeps working
 * unchanged after the first load.
 */

import {
  getReportEntities as fetchReportEntities,
  type ReportEntityData,
  type ReportEntityField,
} from "./admin-api";

export type ReportField = ReportEntityField;

export type ReportEntity = {
  id: string;
  label: string;
  getRows: () => Record<string, unknown>[];
  fields: ReportField[];
};

/** Mutable registry — importers keep a stable reference while rows are refetched. */
const registry: ReportEntity[] = [];

let loaded = false;
let inflight: Promise<ReportEntity[]> | null = null;

function toEntity(data: ReportEntityData): ReportEntity {
  return {
    id: data.id,
    label: data.label,
    fields: data.fields,
    getRows: () => data.rows,
  };
}

/** The loaded entities (empty until :func:`loadReportEntities` resolves). */
export const reportEntities: ReportEntity[] = registry;

/**
 * Load (or reload) the entity rows from the database.
 *
 * Concurrent callers share one request; ``force`` bypasses the cache so a page can
 * pull fresh numbers after new submissions arrive.
 */
export async function loadReportEntities(force = false): Promise<ReportEntity[]> {
  if (loaded && !force) return registry;
  if (inflight && !force) return inflight;
  inflight = fetchReportEntities()
    .then((items) => {
      registry.splice(0, registry.length, ...items.map(toEntity));
      loaded = true;
      return registry;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function getReportEntity(id: string): ReportEntity | undefined {
  return registry.find((entity) => entity.id === id);
}
