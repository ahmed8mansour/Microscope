"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";
import type { ShippingAddressInput } from "@/features/shipping";
import { COUNTRIES } from "@/lib/config/countries";
import { getSubdivisions } from "@/lib/config/subdivisions";
import StreetAutocomplete from "./StreetAutocomplete";
import type { ParsedPlace } from "../lib/places";

const FIELD_CLASS =
  "co-field font-body";

function Req() {
  return <span className="text-leaf-accent-ink"> *</span>;
}

// Structured shipping address fields (Alibaba-style). Renders *only* the fields
// — no <form> wrapper and no submit button — so it can sit inside the single
// pay screen's form alongside the quantity stepper and the Stripe payment
// element (one Pay button submits everything). Reads its react-hook-form state
// from context, so the parent owns validation + submit. The street field is a
// Google Places autocomplete that, on selection, auto-fills country / suburb /
// state / postcode. State is a dropdown for countries we carry subdivisions for
// and a plain text input otherwise. Zod is the source of truth for validation;
// the server re-validates the same schema.
export default function AddressFields() {
  const {
    register,
    control,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<ShippingAddressInput>();

  const country = useWatch({ control, name: "country", defaultValue: "AU" });
  const subdivisions = getSubdivisions(country);
  const hasStateList = subdivisions.length > 0;

  // Auto-fill the rest of the form from a picked Places suggestion.
  function handlePlace(place: ParsedPlace) {
    const nextCountry =
      place.country && COUNTRIES.some((c) => c.code === place.country)
        ? place.country
        : country;
    setValue("country", nextCountry, { shouldValidate: true });
    setValue("line1", place.line1, { shouldValidate: true });
    if (place.line2) setValue("line2", place.line2);
    if (place.city) setValue("city", place.city, { shouldValidate: true });
    if (place.postalCode) setValue("postalCode", place.postalCode, { shouldValidate: true });

    const nextHasList = getSubdivisions(nextCountry).length > 0;
    const stateValue = nextHasList
      ? place.stateCode || place.stateName
      : place.stateName || place.stateCode;
    if (stateValue) setValue("state", stateValue, { shouldValidate: true });
    clearErrors(["line1", "city", "state", "postalCode", "country"]);
  }

  return (
    <div className="space-y-4 text-left">
      {/* Country / region */}
      <div>
        <label htmlFor="country" className="co-label">
          Country / region<Req />
        </label>
        <select id="country" autoComplete="country" {...register("country")} className={FIELD_CLASS}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.country && <p className="text-sm text-danger mt-1">{errors.country.message}</p>}
      </div>

      {/* Full name */}
      <div>
        <label htmlFor="recipientName" className="co-label">
          Full name<Req />
        </label>
        <input
          id="recipientName"
          autoComplete="name"
          {...register("recipientName")}
          className={FIELD_CLASS}
        />
        {errors.recipientName && (
          <p className="text-sm text-danger mt-1">{errors.recipientName.message}</p>
        )}
      </div>

      {/* Street address — Places autocomplete */}
      <div>
        <label htmlFor="line1" className="co-label">
          Street address or P.O. box<Req />
        </label>
        <Controller
          name="line1"
          control={control}
          render={({ field }) => (
            <StreetAutocomplete
              id="line1"
              value={field.value ?? ""}
              onChange={field.onChange}
              onSelectPlace={handlePlace}
              regionCode={country}
              autoComplete="address-line1"
              className={FIELD_CLASS}
            />
          )}
        />
        {errors.line1 && <p className="text-sm text-danger mt-1">{errors.line1.message}</p>}
      </div>

      {/* Apt / suite / unit */}
      <div>
        <label htmlFor="line2" className="co-label">
          Apt, suite, unit <span className="text-ink/40">(optional)</span>
        </label>
        <input
          id="line2"
          autoComplete="address-line2"
          {...register("line2")}
          className={FIELD_CLASS}
        />
        {errors.line2 && <p className="text-sm text-danger mt-1">{errors.line2.message}</p>}
      </div>

      {/* Suburb + State (side by side on wider screens) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="city" className="co-label">
            Suburb<Req />
          </label>
          <input
            id="city"
            autoComplete="address-level2"
            {...register("city")}
            className={FIELD_CLASS}
          />
          {errors.city && <p className="text-sm text-danger mt-1">{errors.city.message}</p>}
        </div>

        <div>
          <label htmlFor="state" className="co-label">
            State / territory<Req />
          </label>
          {hasStateList ? (
            <select
              id="state"
              autoComplete="address-level1"
              {...register("state")}
              className={FIELD_CLASS}
            >
              <option value="">Select…</option>
              {subdivisions.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="state"
              autoComplete="address-level1"
              {...register("state")}
              className={FIELD_CLASS}
            />
          )}
          {errors.state && <p className="text-sm text-danger mt-1">{errors.state.message}</p>}
        </div>
      </div>

      {/* Postcode */}
      <div>
        <label htmlFor="postalCode" className="co-label">
          Postcode<Req />
        </label>
        <input
          id="postalCode"
          autoComplete="postal-code"
          {...register("postalCode")}
          className={FIELD_CLASS}
        />
        {errors.postalCode && (
          <p className="text-sm text-danger mt-1">{errors.postalCode.message}</p>
        )}
      </div>

      <p className="font-body text-xs text-ink/50">
        We&rsquo;ll use your WhatsApp number as the delivery contact number.
      </p>
    </div>
  );
}
