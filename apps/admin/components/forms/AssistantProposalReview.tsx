"use client";

import { Check, X } from "lucide-react";
import type { FormAssistantChange, FormAssistantProposal } from "./assistant-types";

type Props = {
  proposals: FormAssistantProposal[];
  decisions: Record<string, "accepted" | "rejected">;
  onAccept: (change: FormAssistantChange) => void;
  onReject: (changeId: string) => void;
};

export default function AssistantProposalReview({ proposals, decisions, onAccept, onReject }: Props) {
  if (!proposals.length) return null;
  return (
    <section className="space-y-3 rounded-xl border border-[#4f7aab]/25 bg-[#4f7aab]/5 p-3">
      <h4 className="text-xs font-bold text-[#315d8a]">پیشنهادهای قابل بررسی</h4>
      {proposals.map((proposal) => (
        <article key={proposal.id} className="space-y-2">
          <p className="text-xs font-semibold">{proposal.summary}</p>
          {proposal.changes.map((change) => {
            const decision = decisions[change.id];
            return (
              <div key={change.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-900">
                <p>{change.summary}</p>
                {change.kind === "update-field" && <p className="mt-1 text-slate-500">«{change.before.label ?? "—"}» ← «{change.after.label ?? "بدون تغییر عنوان"}»</p>}
                {change.source && <p className="mt-1 text-[0.65rem] text-slate-500">منبع: {change.source.fileName}{change.source.pageOrClause ? `، ${change.source.pageOrClause}` : ""}</p>}
                <div className="mt-2 flex justify-end gap-2">
                  {decision
                    ? <span className={`inline-flex items-center gap-1 ${decision === "accepted" ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500"}`}>{decision === "accepted" ? <Check size={13} /> : <X size={13} />}{decision === "accepted" ? "تأیید شد" : "رد شد"}</span>
                    : <>
                        <button type="button" onClick={() => onReject(change.id)} className="rounded-lg px-2 py-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">رد</button>
                        <button type="button" onClick={() => onAccept(change)} className="rounded-lg bg-emerald-600 px-2 py-1 text-white hover:bg-emerald-700">تأیید تغییر</button>
                      </>}
                </div>
              </div>
            );
          })}
        </article>
      ))}
    </section>
  );
}
