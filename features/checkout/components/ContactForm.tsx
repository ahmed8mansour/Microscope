"use client";

import { useForm } from "react-hook-form";
import { contactSchema, type ContactInput } from "../schemas/checkout.schema";

interface ContactFormProps {
  onSubmit: (input: ContactInput) => void;
  submitting: boolean;
  serverError: string | null;
}

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
        <label htmlFor="email" className="block font-body text-sm text-ink/70 mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register("email")}
          className="w-full border border-ink/20 rounded-[4px] px-3 py-2 font-body text-ink bg-paper-bone focus:outline-none focus:border-cinnabar"
        />
        {errors.email && <p className="text-sm text-cinnabar mt-1">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="whatsapp" className="block font-body text-sm text-ink/70 mb-1">
          WhatsApp number
        </label>
        <input
          id="whatsapp"
          type="tel"
          autoComplete="tel"
          {...register("whatsapp")}
          className="w-full border border-ink/20 rounded-[4px] px-3 py-2 font-body text-ink bg-paper-bone focus:outline-none focus:border-cinnabar"
        />
        {errors.whatsapp && (
          <p className="text-sm text-cinnabar mt-1">{errors.whatsapp.message}</p>
        )}
      </div>

      {serverError && <p className="text-sm text-cinnabar">{serverError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex items-center justify-center px-6 py-3 bg-cinnabar text-paper-bone font-body font-medium rounded-[4px] transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        {submitting ? "Sending code…" : "Send verification code"}
      </button>
    </form>
  );
}
