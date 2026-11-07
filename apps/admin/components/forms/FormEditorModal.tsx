"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, FileText, Paperclip, Send, Sparkles, X } from "lucide-react";
import { useTheme } from "../../theme-context";
import Modal from "../Modal";
import FormSchemaBuilder from "./FormSchemaBuilder";
import AssistantProposalReview from "./AssistantProposalReview";
import type { FormAssistantChange, FormAssistantProposal, FormAssistantRequest } from "./assistant-types";
import type { FormDefinition, FormType, ValidationRule } from "../../app/lib/mock-forms";
import type { ProcessField } from "../../app/lib/mock-processes";
import type { PaymentGateway } from "../../app/lib/payment-gateways";

type Props = {
  open: boolean;
  initial: FormDefinition | null;
  gateways: PaymentGateway[];
  onClose: () => void;
  onSave: (form: FormDefinition) => boolean;
  onRequestAssistantProposal?: (request: FormAssistantRequest) => Promise<FormAssistantProposal[]>;
};

type ChatEntry = { id: string; text: string; files: string[] };

const SUPPORTED_FILES = ".png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.pdf,.doc,.docx,.xls,.xlsx";

function updateFieldTree(fields: ProcessField[], fieldId: string, patch: Partial<ProcessField>): ProcessField[] {
  return fields.map((field) =>
    field.id === fieldId
      ? { ...field, ...patch }
      : field.subFields
        ? { ...field, subFields: updateFieldTree(field.subFields, fieldId, patch) }
        : field
  );
}

function createEmptyForm(): FormDefinition {
  return {
    id: `form-${crypto.randomUUID()}`,
    code: `FORM-${Date.now().toString().slice(-6)}`,
    title: "",
    department: "عمومی",
    description: "",
    icon: "file",
    status: "draft",
    version: "0.1",
    updatedAt: new Date().toISOString(),
    formType: "standard",
    fields: [],
    rules: [],
    applicantGuidance: "",
    directiveFileNames: [],
    versions: [],
  };
}

function PreviewField({ field, t }: { field: ProcessField; t: Record<string, string> }) {
  if (field.type === "section") {
    return (
      <section className={`space-y-3 rounded-xl border p-3 ${t.border}`}>
        <h4 className="text-sm font-bold">{field.label || "بخش جدید"}</h4>
        {(field.subFields ?? []).map((child) => (
          <PreviewField key={child.id} field={child} t={t} />
        ))}
      </section>
    );
  }
  if (field.type === "repeater") {
    return (
      <div className={`rounded-xl border p-3 ${t.border}`}>
        <div className="mb-2 text-xs font-semibold">
          {field.label || "جدول تکرارشونده"}
          {field.required && " *"}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(field.subFields ?? []).map((child) => (
            <PreviewField key={child.id} field={child} t={t} />
          ))}
        </div>
        <p className={`mt-2 text-[0.65rem] ${t.muted}`}>حداقل {field.minRows ?? 0} و حداکثر {field.maxRows ?? 10} ردیف</p>
      </div>
    );
  }
  return (
    <label className={`block space-y-1 text-xs ${t.muted}`}>
      <span>
        {field.label || "فیلد بدون عنوان"}
        {field.required && " *"}
      </span>
      {field.type === "boolean" ? (
        <select className={t.field}>
          <option>انتخاب کنید</option>
          <option>بله</option>
          <option>خیر</option>
        </select>
      ) : field.type === "select" || field.type === "radio" ? (
        <select className={t.field}>
          <option>انتخاب کنید</option>
          {(field.options ?? []).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : field.type === "file" ? (
        <div className={`rounded-xl border border-dashed p-3 ${t.muted} ${t.border}`}>
          بارگذاری فایل ({(field.allowedFileTypes ?? []).join(", ") || "هر نوع"})
        </div>
      ) : (
        <input className={t.field} type={field.type === "number" ? "number" : "text"} placeholder={field.type === "date" ? "تاریخ شمسی" : ""} />
      )}
    </label>
  );
}

export default function FormEditorModal({ open, initial, gateways, onClose, onSave, onRequestAssistantProposal }: Props) {
  const { isDarkMode } = useTheme();

  const t = isDarkMode
    ? {
        field: "w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#15554f]",
        border: "border-white/10",
        muted: "text-white/55",
        panel: "border-white/10 bg-[#122925]",
        card: "border-white/10 bg-[#193632]/50",
        subHeader: "border-white/10 bg-white/[0.04]",
        chip: "bg-white/[0.06]",
        accentText: "text-[#8bd0bf]",
        amberBox: "bg-amber-400/10 text-amber-300",
        roseBox: "bg-rose-500/10 text-rose-300",
        dangerBtn: "text-rose-400",
      }
    : {
        field: "w-full rounded-xl border border-[#d5dad4] bg-white px-3 py-2.5 text-sm text-[#28443d] placeholder:text-[#8c9587] outline-none focus:border-[#15554f]",
        border: "border-[#e1e6df]",
        muted: "text-[#68766c]",
        panel: "border-[#e1e6df] bg-[#f6f7f4]",
        card: "border-[#e1e6df] bg-white",
        subHeader: "border-[#e1e6df] bg-[#f6f7f4]",
        chip: "bg-[#edf0eb]",
        accentText: "text-[#15554f]",
        amberBox: "bg-amber-50 text-amber-800",
        roseBox: "bg-rose-50 text-rose-700",
        dangerBtn: "text-rose-600",
      };

  const [draft, setDraft] = useState<FormDefinition>(createEmptyForm);
  const [errors, setErrors] = useState<string[]>([]);
  const [rulesText, setRulesText] = useState("");
  const [chatText, setChatText] = useState("");
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [proposals, setProposals] = useState<FormAssistantProposal[]>([]);
  const [proposalDecisions, setProposalDecisions] = useState<Record<string, "accepted" | "rejected">>({});
  const [assistantError, setAssistantError] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const next = initial ? structuredClone(initial) : createEmptyForm();
    setDraft(next);
    setRulesText(next.rules.map((rule) => rule.text).join("\n"));
    setErrors([]);
    setChatText("");
    setChatLog([]);
    setFiles([]);
    setProposals([]);
    setProposalDecisions({});
    setAssistantError("");
    setAssistantBusy(false);
  }, [initial, open]);

  const isPayment = draft.formType === "payment";
  const update = <K extends keyof FormDefinition>(key: K, value: FormDefinition[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const flattenedFields = useMemo(() => {
    const output: ProcessField[] = [];
    const visit = (field: ProcessField) => {
      output.push(field);
      field.subFields?.forEach(visit);
    };
    draft.fields.forEach(visit);
    return output;
  }, [draft.fields]);

  const addRule = () => {
    const line = `قانون اعتبارسنجی ${draft.rules.length + 1}`;
    const rule: ValidationRule = { id: `rule-${crypto.randomUUID()}`, text: line };
    update("rules", [...draft.rules, rule]);
    setRulesText((current) => [current, line].filter(Boolean).join("\n"));
  };
  const updateRules = (value: string) => {
    setRulesText(value);
    const previous = new Map(draft.rules.map((rule) => [rule.text, rule]));
    update(
      "rules",
      value
        .split("\n")
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => previous.get(text) ?? { id: `rule-${crypto.randomUUID()}`, text })
    );
  };

  const save = () => {
    const issues: string[] = [];
    if (!draft.title.trim()) issues.push("عنوان فرم را وارد کنید.");
    if (!/^[A-Za-z0-9-]{2,30}$/.test(draft.code.trim())) issues.push("کد فرم باید شامل حروف انگلیسی، عدد یا خط تیره باشد.");
    if (!isPayment) {
      if (!draft.fields.some((field) => field.type === "section")) issues.push("حداقل یک بخش برای فرم بسازید.");
      if (flattenedFields.some((field) => !field.label.trim())) issues.push("عنوان همه‌ی بخش‌ها و فیلدها باید مشخص باشد.");
    }
    if (isPayment && !draft.payment?.gatewayId) issues.push("درگاه پرداخت را انتخاب کنید.");
    if (issues.length) {
      setErrors(issues);
      return;
    }
    const saved = onSave({ ...draft, updatedAt: new Date().toISOString() });
    if (saved) onClose();
  };

  const addMessage = async () => {
    if (!chatText.trim() && files.length === 0) return;
    const prompt = chatText.trim();
    const attachedFiles = [...files];
    setChatLog((current) => [
      ...current,
      { id: crypto.randomUUID(), text: prompt || "فایل پیوست‌شده", files: attachedFiles.map((file) => file.name) },
    ]);
    setChatText("");
    setFiles([]);
    setAssistantError("");
    if (onRequestAssistantProposal) {
      setAssistantBusy(true);
      try {
        const result = await onRequestAssistantProposal({
          prompt,
          files: attachedFiles,
          currentForm: { id: draft.id, title: draft.title, formType: draft.formType, fields: draft.fields, rules: draft.rules },
        });
        if (!Array.isArray(result) || result.some((proposal) => !proposal.id || !Array.isArray(proposal.changes))) {
          throw new Error("پاسخ دستیار با ساختار پیشنهادهای فرم سازگار نیست.");
        }
        setProposals((current) => [...current, ...result]);
      } catch (requestError) {
        console.error("دریافت پیشنهاد ساخت‌یافته از دستیار ناموفق بود:", requestError);
        setAssistantError(requestError instanceof Error ? requestError.message : "دریافت پیشنهاد از دستیار ناموفق بود.");
      } finally {
        setAssistantBusy(false);
      }
    }
  };

  const acceptProposalChange = (change: FormAssistantChange) => {
    if (change.kind === "add-field") {
      const section = draft.fields.find((field) => field.id === change.sectionId && field.type === "section");
      if (!section || flattenedFields.some((field) => field.id === change.field.id)) {
        setAssistantError("پیشنهاد فیلد معتبر نیست یا بخش مقصد پیدا نشد.");
        return;
      }
      update(
        "fields",
        draft.fields.map((field) => (field.id === section.id ? { ...field, subFields: [...(field.subFields ?? []), change.field] } : field))
      );
    } else if (change.kind === "update-field") {
      if (!flattenedFields.some((field) => field.id === change.fieldId)) {
        setAssistantError("فیلد پیشنهادی برای ویرایش در این فرم پیدا نشد.");
        return;
      }
      update("fields", updateFieldTree(draft.fields, change.fieldId, change.after));
    } else {
      if (draft.rules.some((rule) => rule.id === change.rule.id)) {
        setAssistantError("شناسه‌ی قانون پیشنهادی تکراری است.");
        return;
      }
      update("rules", [...draft.rules, change.rule]);
      setRulesText((current) => [current, change.rule.text].filter(Boolean).join("\n"));
    }
    setProposalDecisions((current) => ({ ...current, [change.id]: "accepted" }));
    setAssistantError("");
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "ویرایش فرم" : "ثبت فرم جدید"} maxWidthClass="max-w-[95vw]">
      <div className="space-y-5" dir="rtl">
        <section className={`space-y-4 rounded-2xl border p-4 ${t.panel}`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold">اطلاعات پایه فرم</h3>
              <p className={`mt-1 text-xs ${t.muted}`}>کد فرم هنگام ایجاد به‌صورت خودکار ساخته می‌شود.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold text-[#15554f] ${isDarkMode ? "bg-[#15554f]/25" : "bg-[#15554f]/10"}`} dir="ltr">
              {draft.code}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className={`space-y-1 text-xs ${t.muted}`}>
              <span>عنوان فرم</span>
              <input className={t.field} value={draft.title} onChange={(event) => update("title", event.target.value)} />
            </label>
            <label className={`space-y-1 text-xs ${t.muted}`}>
              <span>واحد متولی</span>
              <input className={t.field} value={draft.department} onChange={(event) => update("department", event.target.value)} />
            </label>
            <label className={`space-y-1 text-xs ${t.muted}`}>
              <span>نوع فرم</span>
              <select className={t.field} value={draft.formType} onChange={(event) => update("formType", event.target.value as FormType)}>
                <option value="standard">عادی (جمع‌آوری داده)</option>
                <option value="document">بارگذاری مدرک</option>
                <option value="payment">پرداخت</option>
              </select>
            </label>
          </div>
          <label className={`block space-y-1 text-xs ${t.muted}`}>
            <span>توضیحات</span>
            <textarea className={t.field} rows={2} value={draft.description} onChange={(event) => update("description", event.target.value)} />
          </label>
        </section>

        {isPayment ? (
          <section className={`space-y-4 rounded-2xl border p-4 ${t.card}`}>
            <h3 className="font-bold">تنظیمات فرم پرداخت</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`space-y-1 text-xs ${t.muted}`}>
                <span>درگاه پرداخت</span>
                <select
                  className={t.field}
                  value={draft.payment?.gatewayId ?? ""}
                  onChange={(event) => update("payment", { ...draft.payment, gatewayId: event.target.value })}
                >
                  <option value="">انتخاب درگاه</option>
                  {gateways.map((gateway) => (
                    <option key={gateway.id} value={gateway.id}>
                      {gateway.bankName}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`space-y-1 text-xs ${t.muted}`}>
                <span>مبلغ پیش‌فرض/ثابت (ریال، اختیاری)</span>
                <input
                  className={t.field}
                  type="number"
                  min={0}
                  value={draft.payment?.defaultAmount ?? ""}
                  onChange={(event) =>
                    update("payment", {
                      ...draft.payment,
                      gatewayId: draft.payment?.gatewayId ?? "",
                      defaultAmount: event.target.value === "" ? undefined : Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <p className={`rounded-xl p-3 text-xs leading-6 ${t.amberBox}`}>
              فرمول محاسبه‌ی دقیق مبلغ، پس از اتصال این فرم به یک پروسه، در تنظیمات همان پروسه مشخص می‌شود.
            </p>
          </section>
        ) : (
          <>
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.8fr)]">
              <div className="min-w-0 space-y-4">
                <section className={`rounded-2xl border p-4 ${t.card}`}>
                  <FormSchemaBuilder fields={draft.fields} onChange={(fields) => update("fields", fields)} />
                </section>
                <section className={`space-y-3 rounded-2xl border p-4 ${t.card}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">قوانین اعتبارسنجی</h3>
                    <button type="button" onClick={addRule} className="text-xs font-semibold text-[#15554f]">
                      افزودن قانون
                    </button>
                  </div>
                  <textarea className={t.field} rows={3} placeholder="هر قانون را در یک خط بنویسید" value={rulesText} onChange={(event) => updateRules(event.target.value)} />
                  {draft.rules.some((rule) => rule.source) && (
                    <div className={`space-y-1 text-xs ${t.muted}`}>
                      {draft.rules
                        .filter((rule) => rule.source)
                        .map((rule) => (
                          <p key={rule.id}>
                            منبع «{rule.text}»: {rule.source?.fileName}
                            {rule.source?.pageOrClause ? `، ${rule.source.pageOrClause}` : ""}
                          </p>
                        ))}
                    </div>
                  )}
                </section>
              </div>

              <aside className="min-w-0 space-y-4">
                <section className={`overflow-hidden rounded-2xl border ${t.border}`}>
                  <div className={`flex items-center gap-2 border-b px-4 py-3 ${t.subHeader}`}>
                    <FileText size={17} className={t.accentText} />
                    <h3 className="text-sm font-bold">پیش‌نمایش زنده</h3>
                  </div>
                  <div className="max-h-[55vh] space-y-3 overflow-y-auto p-4">
                    <div>
                      <h4 className="font-bold">{draft.title || "عنوان فرم"}</h4>
                      <p className={`mt-1 text-xs ${t.muted}`}>{draft.description || "توضیحات فرم"}</p>
                    </div>
                    {draft.applicantGuidance && <p className={`rounded-lg p-2 text-xs ${t.amberBox}`}>{draft.applicantGuidance}</p>}
                    {draft.fields.map((field) => (
                      <PreviewField key={field.id} field={field} t={t} />
                    ))}
                    {!draft.fields.length && <p className={`py-8 text-center text-xs ${t.muted}`}>با افزودن بخش و فیلد، پیش‌نمایش به‌روز می‌شود.</p>}
                  </div>
                </section>

                <section className={`flex max-h-[55vh] min-h-80 flex-col overflow-hidden rounded-2xl border ${t.border}`}>
                  <div className={`flex items-center gap-2 border-b px-4 py-3 ${t.subHeader}`}>
                    <Bot size={17} className={t.accentText} />
                    <h3 className="text-sm font-bold">گفتگو با دستیار هوشمند</h3>
                    <Sparkles size={14} className="text-amber-500" />
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto p-3">
                    <p className={`rounded-xl p-3 text-xs leading-5 ${t.amberBox}`}>
                      سرویس هوش مصنوعی هنوز در این پروژه پیکربندی نشده است. پیام‌ها و فایل‌ها فقط در همین صفحه نگهداری می‌شوند و هیچ پیشنهاد خودکاری ساخته نمی‌شود.
                    </p>
                    {chatLog.map((entry) => (
                      <div key={entry.id} className={`rounded-xl p-3 text-xs ${t.chip}`}>
                        <p>{entry.text}</p>
                        {entry.files.length > 0 && <p className={`mt-2 ${t.muted}`}>پیوست: {entry.files.join("، ")}</p>}
                      </div>
                    ))}
                    <AssistantProposalReview
                      proposals={proposals}
                      decisions={proposalDecisions}
                      onAccept={acceptProposalChange}
                      onReject={(changeId) => setProposalDecisions((current) => ({ ...current, [changeId]: "rejected" }))}
                    />
                    {assistantError && <p role="alert" className={`rounded-lg p-2 text-xs ${t.roseBox}`}>{assistantError}</p>}
                    {files.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {files.map((file) => (
                          <span key={`${file.name}-${file.lastModified}`} className={`rounded-lg px-2 py-1 text-[0.65rem] ${t.chip} ${t.accentText}`}>
                            {file.name}
                            <button type="button" className="mr-2 text-rose-500" onClick={() => setFiles((current) => current.filter((item) => item !== file))}>
                              <X className="inline h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`space-y-2 border-t p-3 ${t.border}`}>
                    <textarea
                      className={t.field}
                      rows={2}
                      placeholder="توضیح فرم موردنظر (فعلاً بدون ارسال به مدل)"
                      value={chatText}
                      onChange={(event) => setChatText(event.target.value)}
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <input
                          ref={fileRef}
                          className="hidden"
                          type="file"
                          multiple
                          accept={SUPPORTED_FILES}
                          onChange={(event) => {
                            setFiles((current) => [...current, ...Array.from(event.target.files ?? [])]);
                            event.currentTarget.value = "";
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          title="پیوست فایل"
                          className={`rounded-lg border p-2 transition-colors ${t.border} ${t.muted} ${isDarkMode ? "hover:bg-white/[0.06]" : "hover:bg-[#f6f7f4]"}`}
                        >
                          <Paperclip size={16} />
                        </button>
                        <span className={`self-center text-[0.65rem] ${t.muted}`}>Word · Excel · PDF · تصویر</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void addMessage()}
                        disabled={assistantBusy || (!chatText.trim() && files.length === 0)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#15554f] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#246b61] disabled:opacity-50"
                      >
                        <Send size={14} />
                        {assistantBusy ? "در حال دریافت..." : onRequestAssistantProposal ? "ارسال برای پیشنهاد ساخت‌یافته" : "ثبت پیام محلی"}
                      </button>
                    </div>
                  </div>
                </section>
              </aside>
            </div>
            <label className={`block space-y-1 text-xs ${t.muted}`}>
              <span>راهنمای تکمیل فرم</span>
              <textarea className={t.field} rows={2} value={draft.applicantGuidance} onChange={(event) => update("applicantGuidance", event.target.value)} />
            </label>
          </>
        )}

        {errors.length > 0 && (
          <div role="alert" className={`rounded-xl border p-3 text-xs leading-6 ${isDarkMode ? "border-rose-800/40" : "border-rose-200"} ${t.roseBox}`}>
            {errors.map((error) => (
              <p key={error}>• {error}</p>
            ))}
          </div>
        )}

        <div className={`flex flex-wrap justify-end gap-2 border-t pt-4 ${t.border}`}>
          <button type="button" onClick={onClose} className={`rounded-xl border px-4 py-2 text-sm transition-colors ${t.border} ${t.muted} ${isDarkMode ? "hover:bg-white/[0.05]" : "hover:bg-[#f6f7f4]"}`}>
            انصراف
          </button>
          <button type="button" onClick={save} className="rounded-xl bg-[#15554f] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#246b61]">
            ذخیره فرم
          </button>
        </div>
      </div>
    </Modal>
  );
}