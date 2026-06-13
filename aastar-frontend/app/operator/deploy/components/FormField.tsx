"use client";

/**
 * Labeled text/number input used across wizard step forms.
 *
 * @module app/operator/deploy/components/FormField
 */
interface FormFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number";
  hint?: string;
  mono?: boolean;
  disabled?: boolean;
}

export default function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  mono,
  disabled,
}: FormFieldProps) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-slate-500 dark:focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:focus:ring-emerald-500 disabled:opacity-60 ${
          mono ? "font-mono" : ""
        }`}
      />
      {hint && <span className="block text-xs text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}
