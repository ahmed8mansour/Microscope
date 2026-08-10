"use client";

import { useForm } from "react-hook-form";
import { otpCodeSchema } from "../schemas/checkout.schema";

interface OtpFormProps {
  email: string;
  onSubmit: (code: string) => void;
  onResend: () => void;
  submitting: boolean;
  resending: boolean;
  serverError: string | null;
}

interface OtpFormValues {
  code: string;
}

export default function OtpForm({
  email,
  onSubmit,
  onResend,
  submitting,
  resending,
  serverError,
}: OtpFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<OtpFormValues>({ defaultValues: { code: "" } });

  function onValid(data: OtpFormValues) {
    const parsed = otpCodeSchema.safeParse(data.code);
    if (!parsed.success) {
      setError("code", { message: parsed.error.issues[0]?.message });
      return;
    }
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-4 text-left">
      <p className="font-body text-sm text-ink/70">
        We sent a 6-digit code to <span className="text-ink">{email}</span>.
      </p>

      <div>
        <label htmlFor="code" className="block font-body text-sm text-ink/70 mb-1">
          Verification code
        </label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          {...register("code")}
          className="w-full border border-ink/20 rounded-[4px] px-3 py-2 font-utility text-ink text-lg tracking-widest bg-paper-bone focus:outline-none focus:border-cinnabar"
        />
        {errors.code && <p className="text-sm text-cinnabar mt-1">{errors.code.message}</p>}
      </div>

      {serverError && <p className="text-sm text-cinnabar">{serverError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex items-center justify-center px-6 py-3 bg-cinnabar text-paper-bone font-body font-medium rounded-[4px] transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        {submitting ? "Verifying…" : "Verify code"}
      </button>

      <button
        type="button"
        onClick={onResend}
        disabled={resending}
        className="w-full font-body text-sm text-ink/60 underline decoration-wattle decoration-2 underline-offset-4 hover:opacity-70 disabled:opacity-50 cursor-pointer"
      >
        {resending ? "Resending…" : "Resend code"}
      </button>
    </form>
  );
}
