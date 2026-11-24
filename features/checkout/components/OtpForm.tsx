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
  // Neutral informational message (not an error) — e.g. when the customer is
  // sent back here to re-verify because their verification expired at pay time.
  notice?: string | null;
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
  notice,
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
      {notice && (
        <p className="co-banner font-body text-sm">
          {notice}
        </p>
      )}

      <p className="font-body text-sm text-ink/70">
        We sent a 6-digit code to <span className="text-ink">{email}</span>.
      </p>

      <div>
        <label htmlFor="code" className="co-label">
          Verification code
        </label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          {...register("code")}
          className="co-field font-utility text-lg tracking-widest"
        />
        {errors.code && <p className="text-sm text-danger mt-1">{errors.code.message}</p>}
      </div>

      {serverError && <p className="text-sm text-danger">{serverError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="co-btn font-body"
      >
        {submitting ? "Verifying…" : "Verify code"}
      </button>

      <button
        type="button"
        onClick={onResend}
        disabled={resending}
        className="co-link w-full font-body text-sm hover:opacity-70 disabled:opacity-50 cursor-pointer"
      >
        {resending ? "Resending…" : "Resend code"}
      </button>
    </form>
  );
}
