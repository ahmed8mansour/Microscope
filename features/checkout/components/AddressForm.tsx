"use client";

import { useForm } from "react-hook-form";
import {
  shippingAddressSchema,
  ADDRESS_FORM_FIELDS,
  type ShippingAddressInput,
} from "@/features/shipping";
import { SHIPS_TO } from "@/lib/config/shipping";

interface AddressFormProps {
  onSubmit: (input: ShippingAddressInput) => void;
  submitting: boolean;
  serverError: string | null;
}

const FIELD_CLASS =
  "w-full border border-ink/20 rounded-[4px] px-3 py-2 font-body text-ink bg-paper-bone focus:outline-none focus:border-cinnabar";

// Structured shipping address (feature 005). Fields, order, and labels are
// driven by ADDRESS_FORM_FIELDS — the single canonical AliExpress/Alibaba
// mapping — so the checkout form always matches the supplier order form and the
// admin fulfillment panel. Zod is the source of truth for validation (the
// server re-validates); this is UX only.
export default function AddressForm({ onSubmit, submitting, serverError }: AddressFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ShippingAddressInput>({
    defaultValues: {
      recipientName: "",
      country: SHIPS_TO[0],
      state: "",
      city: "",
      line1: "",
      line2: "",
      postalCode: "",
    },
  });

  function onValid(data: ShippingAddressInput) {
    const parsed = shippingAddressSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        setError(issue.path[0] as keyof ShippingAddressInput, { message: issue.message });
      }
      return;
    }
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-4 text-left">
      {ADDRESS_FORM_FIELDS.map((f) => {
        const name = f.key as keyof ShippingAddressInput;
        const error = errors[name];
        return (
          <div key={f.key}>
            <label htmlFor={f.key} className="block font-body text-sm text-ink/70 mb-1">
              {f.label}
              {f.optional && <span className="text-ink/40"> (optional)</span>}
            </label>
            {f.key === "country" ? (
              <select id={f.key} autoComplete={f.autoComplete} {...register(name)} className={FIELD_CLASS}>
                {SHIPS_TO.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            ) : (
              <input id={f.key} autoComplete={f.autoComplete} {...register(name)} className={FIELD_CLASS} />
            )}
            {error && <p className="text-sm text-cinnabar mt-1">{error.message}</p>}
          </div>
        );
      })}

      <p className="font-body text-xs text-ink/50">
        We&rsquo;ll use your WhatsApp number as the delivery contact number.
      </p>

      {serverError && <p className="text-sm text-cinnabar">{serverError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex items-center justify-center px-6 py-3 bg-cinnabar text-paper-bone font-body font-medium rounded-[4px] transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        {submitting ? "Saving address…" : "Continue to payment"}
      </button>
    </form>
  );
}
