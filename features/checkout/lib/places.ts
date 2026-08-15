"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

// Thin, contained wrapper around Google Places API "Autocomplete (New)". All of
// the loosely-typed Google surface lives in THIS file so the component/form stay
// strongly typed. Billing model: keystrokes ride a session token (free
// "Autocomplete Session Usage" SKU); a single Place Details call fires only when
// the user PICKS a suggestion (the 10k/month free "Place Details Essentials"
// SKU). Missing/invalid key → placesEnabled is false and the field degrades to a
// plain text input (checkout still works; the server does Zod-only validation).

const KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;

export const placesEnabled = Boolean(KEY);

export interface PlaceSuggestion {
  id: string;
  primary: string;
  secondary: string;
  prediction: any; // google.maps.places.PlacePrediction — used to fetch details
}

export interface ParsedPlace {
  line1: string;
  line2: string;
  city: string;
  stateCode: string; // administrative_area_level_1 shortText (e.g. "VIC")
  stateName: string; // administrative_area_level_1 longText (e.g. "Victoria")
  postalCode: string;
  country: string; // ISO alpha-2 shortText
}

function ready(): boolean {
  return Boolean((window as any).google?.maps?.places?.AutocompleteSuggestion);
}

let loadPromise: Promise<boolean> | null = null;

// Ensures the Places SDK is available. Injects the Maps JS script once, then
// POLLS for readiness rather than relying solely on a single onload/importLibrary
// event — that event-only approach can race under React Strict Mode's
// double-mount and cache a spurious `false`. On timeout we clear the cached
// promise so a later attempt can retry instead of being stuck off.
export function loadPlaces(): Promise<boolean> {
  if (typeof window === "undefined" || !KEY) return Promise.resolve(false);
  if (ready()) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>((resolve) => {
    if (!document.getElementById("gmaps-places-sdk")) {
      const script = document.createElement("script");
      script.id = "gmaps-places-sdk";
      script.async = true;
      script.src =
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY!)}` +
        `&v=weekly&libraries=places&loading=async`;
      document.head.appendChild(script);
    }

    const startedAt = Date.now();
    const tick = async () => {
      const maps = (window as any).google?.maps;
      if (maps?.importLibrary && !ready()) {
        try {
          await maps.importLibrary("places");
        } catch {
          /* keep polling */
        }
      }
      if (ready()) {
        resolve(true);
      } else if (Date.now() - startedAt > 10000) {
        loadPromise = null; // allow a future retry
        resolve(false);
      } else {
        setTimeout(tick, 120);
      }
    };
    void tick();
  });
  return loadPromise;
}

export function newSessionToken(): any {
  return new (window as any).google.maps.places.AutocompleteSessionToken();
}

export async function fetchSuggestions(
  input: string,
  sessionToken: any,
  regionCode?: string
): Promise<PlaceSuggestion[]> {
  const places = (window as any).google.maps.places;
  const request: any = { input, sessionToken };
  if (regionCode) request.includedRegionCodes = [regionCode.toLowerCase()];

  const { suggestions } =
    await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

  return (suggestions ?? [])
    .map((s: any) => s.placePrediction)
    .filter(Boolean)
    .map((p: any) => ({
      id: p.placeId,
      primary: p.mainText?.text ?? p.text?.text ?? "",
      secondary: p.secondaryText?.text ?? "",
      prediction: p,
    }));
}

function pick(components: any[], type: string): { long: string; short: string } | undefined {
  const c = components.find((x) => (x.types ?? []).includes(type));
  return c ? { long: c.longText ?? "", short: c.shortText ?? "" } : undefined;
}

// Billable Place Details call — fetches the structured components for the
// picked prediction and maps them to our address fields.
export async function fetchPlaceDetails(prediction: any): Promise<ParsedPlace> {
  const place = prediction.toPlace();
  await place.fetchFields({ fields: ["addressComponents"] });
  const components: any[] = place.addressComponents ?? [];

  const streetNumber = pick(components, "street_number")?.long ?? "";
  const route = pick(components, "route")?.long ?? "";
  const subpremise = pick(components, "subpremise")?.long ?? "";
  const city =
    pick(components, "locality")?.long ??
    pick(components, "postal_town")?.long ??
    pick(components, "sublocality_level_1")?.long ??
    pick(components, "administrative_area_level_2")?.long ??
    "";
  const state = pick(components, "administrative_area_level_1");
  const postalCode = pick(components, "postal_code")?.long ?? "";
  const country = pick(components, "country")?.short ?? "";

  return {
    line1: [streetNumber, route].filter(Boolean).join(" ") || route,
    line2: subpremise,
    city,
    stateCode: state?.short ?? "",
    stateName: state?.long ?? "",
    postalCode,
    country,
  };
}
