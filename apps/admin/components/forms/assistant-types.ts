import type { ProcessField } from "../../app/lib/mock-processes";
import type { ValidationRule } from "../../app/lib/mock-forms";

export type FormAssistantChange =
  | { id: string; kind: "add-field"; sectionId: string; field: ProcessField; summary: string; source?: ValidationRule["source"] }
  | { id: string; kind: "update-field"; fieldId: string; before: Partial<ProcessField>; after: Partial<ProcessField>; summary: string; source?: ValidationRule["source"] }
  | { id: string; kind: "add-rule"; rule: ValidationRule; summary: string; source?: ValidationRule["source"] };

export type FormAssistantProposal = {
  id: string;
  summary: string;
  changes: FormAssistantChange[];
};

export type FormAssistantRequest = {
  prompt: string;
  files: File[];
  currentForm: FormAssistantRequestForm;
};

export type FormAssistantRequestForm = {
  id: string;
  title: string;
  formType: string;
  fields: ProcessField[];
  rules: ValidationRule[];
};
