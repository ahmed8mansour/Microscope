"use client";

import { useForm } from "react-hook-form";
import { contactSchema, type ContactInput } from "../schemas/checkout.schema";

interface ContactFormProps {
  onSubmit: (input: ContactInput) => void;
  submitting: boolean;
  serverError: string | null;
}

const FIELD_ICON = {
  viewBox: "0 0 24 24",
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export default function ContactForm({ onSubmit, submitting, serverError }: ContactFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ContactInput>({ defaultValues: { email: "", whatsapp: "" } });

  function onValid(data: ContactInput) {
    // Zod is the source of truth for validation (RHF just manages form
    // state/errors) — matches the constitution's RHF + Zod stack.
    const parsed = contactSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof ContactInput;
        setError(field, { message: issue.message });
      }
      return;
    }
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-4 text-left">
      <div>
        <label htmlFor="email" className="co-label">
          Email
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-leaf-accent">
            <svg {...FIELD_ICON}>
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </span>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
            className="co-field co-field--icon font-body"
          />
        </div>
        {errors.email && <p className="text-sm text-danger mt-1">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="whatsapp" className="co-label">
          WhatsApp number
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-leaf-accent">
            <svg {...FIELD_ICON}>
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            </svg>
          </span>
          <input
            id="whatsapp"
            type="tel"
            autoComplete="tel"
            {...register("whatsapp")}
            className="co-field co-field--icon font-body"
          />
        </div>
        {errors.whatsapp && (
          <p className="text-sm text-danger mt-1">{errors.whatsapp.message}</p>
        )}
      </div>

      {serverError && <p className="text-sm text-danger">{serverError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="co-btn font-body"
      >
        <svg {...FIELD_ICON} width={18} height={18}>
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        {submitting ? "Sending code…" : "Send verification code"}
      </button>
    </form>
  );
}
