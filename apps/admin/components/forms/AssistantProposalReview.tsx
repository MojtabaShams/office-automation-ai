"use client";

import { Check, X } from "lucide-react";
import { useTheme } from "../../theme-context";
import type { FormAssistantChange, FormAssistantProposal } from "./assistant-types";

type Props = {
  proposals: FormAssistantProposal[];
  decisions: Record<string, "accepted" | "rejected">;
  onAccept: (change: FormAssistantChange) => void;
  onReject: (changeId: string) => void;
};

export default function AssistantProposalReview({ proposals, decisions, onAccept, onReject }: Props) {
  const { isDarkMode } = useTheme();
  if (!proposals.length) return null;

  const t = isDarkMode
    ? {
        wrap: "border-[#15554f]/40 bg-[#15554f]/10",
        title: "text-[#8bd0bf]",
        card: "border-white/10 bg-[#122925]",
        muted: "text-white/55",
        rejectedText: "text-white/55",
        rejectHover: "hover:bg-rose-500/10",
      }
    : {
        wrap: "border-[#15554f]/25 bg-[#15554f]/5",
        title: "text-[#15554f]",
        card: "border-[#e1e6df] bg-white",
        muted: "text-[#68766c]",
        rejectedText: "text-[#68766c]",
        rejectHover: "hover:bg-rose-50",
      };

  return (
    <section className={`space-y-3 rounded-xl border p-3 ${t.wrap}`}>
      <h4 className={`text-xs font-bold ${t.title}`}>پیشنهادهای قابل بررسی</h4>
      {proposals.map((proposal) => (
        <article key={proposal.id} className="space-y-2">
          <p className="text-xs font-semibold">{proposal.summary}</p>
          {proposal.changes.map((change) => {
            const decision = decisions[change.id];
            return (
              <div key={change.id} className={`rounded-lg border p-2.5 text-xs ${t.card}`}>
                <p>{change.summary}</p>
                {change.kind === "update-field" && (
                  <p className={`mt-1 ${t.muted}`}>
                    «{change.before.label ?? "—"}» ← «{change.after.label ?? "بدون تغییر عنوان"}»
                  </p>
                )}
                {change.source && (
                  <p className={`mt-1 text-[0.65rem] ${t.muted}`}>
                    منبع: {change.source.fileName}
                    {change.source.pageOrClause ? `، ${change.source.pageOrClause}` : ""}
                  </p>
                )}
                <div className="mt-2 flex justify-end gap-2">
                  {decision ? (
                    <span className={`inline-flex items-center gap-1 ${decision === "accepted" ? (isDarkMode ? "text-emerald-300" : "text-emerald-700") : t.rejectedText}`}>
                      {decision === "accepted" ? <Check size={13} /> : <X size={13} />}
                      {decision === "accepted" ? "تأیید شد" : "رد شد"}
                    </span>
                  ) : (
                    <>
                      <button type="button" onClick={() => onReject(change.id)} className={`rounded-lg px-2 py-1 text-rose-600 ${t.rejectHover}`}>
                        رد
                      </button>
                      <button type="button" onClick={() => onAccept(change)} className="rounded-lg bg-emerald-600 px-2 py-1 text-white hover:bg-emerald-700">
                        تأیید تغییر
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </article>
      ))}
    </section>
  );
}