"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

type ThemedSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
  arrowClassName?: string;
  wrapperClassName?: string;
};

export default function ThemedSelect({
  children,
  className = "",
  arrowClassName = "left-3",
  wrapperClassName = "",
  ...props
}: ThemedSelectProps) {
  return (
    <span className={`relative inline-flex ${wrapperClassName}`}>
      <select {...props} className={`appearance-none ${className}`}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${arrowClassName}`}
      />
    </span>
  );
}
