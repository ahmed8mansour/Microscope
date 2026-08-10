// Public barrel — pure/shared exports only (schema, canonical field mapping,
// normalization, types). The server-only repository
// (data/shipping-address.repository) is imported directly by server code so
// this barrel stays safe to import from client components.
export { shippingAddressSchema } from './schemas/address.schema';
export type { ShippingAddressInput, StoredShippingAddress, NormalizedAddress } from './types';
export {
  ADDRESS_FIELDS,
  ADDRESS_FORM_FIELDS,
  type AddressFieldDef,
  type AddressFieldKey,
} from './domain/fields';
export { normalizeAddress } from './domain/normalize';
