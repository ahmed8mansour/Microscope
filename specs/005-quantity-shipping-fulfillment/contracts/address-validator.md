# Contract: Address validation & the canonical AliExpress field mapping (Zod-only)

Revised 2026-08-09: **no external validation provider.** Validation is Zod-only + a ships-to
allow-list + per-country postal format + deterministic normalization. The shipping address's
fields, order, labels, and supplier-field names come from **one canonical mapping** so the
checkout form, the stored snapshot, and the admin fulfillment panel cannot drift.

## Canonical field mapping — `features/shipping/domain/fields.ts`

`ADDRESS_FIELDS` (ordered to match the AliExpress/Alibaba delivery-address form):

| key | label (form + panel) | supplier field (AliExpress) | notes |
|-----|----------------------|-----------------------------|-------|
| `country` | Country/Region | `country` | ISO-3166 alpha-2, ∈ `SHIPS_TO` |
| `recipientName` | Contact name | `contactPerson` | |
| `phone` | Mobile number | `mobileNo` | **from WhatsApp** — not a form field |
| `line1` | Street address | `address` | |
| `line2` | Apt, suite, unit | `address2` | optional |
| `city` | City | `city` | |
| `state` | State/Province | `province` | |
| `postalCode` | Zip/Postal code | `zip` | per-country format |

- `ADDRESS_FORM_FIELDS` = `ADDRESS_FIELDS` minus `phone` (the customer-entered subset).
- The checkout `AddressForm` renders from `ADDRESS_FORM_FIELDS`; the admin panel renders from
  `ADDRESS_FIELDS`; the Zod schema keys equal `ADDRESS_FORM_FIELDS` keys. A drift is caught by
  `tests/unit/address-schema.test.ts` (guarantee test).

## Validation — `features/shipping/schemas/address.schema.ts` + `lib/config/shipping.ts`

- **Zod (structural)**: required fields, length bounds, country a 2-letter code (uppercased).
  Failure → route returns **400 `invalid_input`**.
- **Ships-to allow-list** (`isShippableCountry`) + **per-country postal format**
  (`isValidPostalCode`): failure → route returns **422 `address_invalid`**.
- No deliverability/probabilistic verdict; no external call; no key.

## Normalization — `features/shipping/domain/normalize.ts`

`normalizeAddress(input) → NormalizedAddress`: pure and deterministic — trims every field,
uppercases the country, cleans the postal code (uppercase, single-spaced). The normalized values
(not the raw input) are stored in the snapshot. The recipient phone is the customer's WhatsApp
number, added at snapshot time.

## Removed

- `lib/address/*` (the `AddressValidator` seam + Google adapter) — deleted.
- `ADDRESS_VALIDATION_API_KEY` — no longer needed.
- Statuses `422 address_undeliverable` and `503 address_unverified` — no external verdict/outage.
