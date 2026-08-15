// Regenerates lib/config/countries.ts — the full ISO 3166-1 country list for the
// checkout country dropdown. Names come from Intl.DisplayNames so we never
// hand-type 250 country names. Run: `node scripts/gen-countries.mjs`
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CODES = `AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(/\s+/);

const dn = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = CODES.map((code) => ({ code, name: dn.of(code) ?? code })).sort((a, b) =>
  a.name.localeCompare(b.name)
);

const body = `// AUTO-GENERATED (scripts/gen-countries.mjs via Intl.DisplayNames) — do not hand-edit.
// Full ISO 3166-1 country list for the checkout country dropdown. The store
// ships broadly (supplier-fulfilled), so this is the full set, sorted by name;
// the supplier rejects the rare unshippable territory rather than us gating it.

export interface Country {
  code: string; // ISO 3166-1 alpha-2, uppercase
  name: string;
}

export const COUNTRIES: readonly Country[] = ${JSON.stringify(countries, null, 2)} as const;

const CODE_SET = new Set(COUNTRIES.map((c) => c.code));

// Thin structural check used by the Zod schema (still no external API): the
// country must be a real ISO alpha-2 code, uppercased by the schema first.
export function isValidCountryCode(code: string): boolean {
  return CODE_SET.has(code.toUpperCase());
}
`;

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'config', 'countries.ts');
writeFileSync(out, body);
console.log('Wrote', countries.length, 'countries to', out);
