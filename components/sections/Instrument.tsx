"use client";

import Eyebrow from "@/components/ui/Eyebrow";

const features = [
  { label: "A", text: "2.0” HD screen — sees what the lens sees, no eyepiece squinting" },
  { label: "B", text: "60×–120× magnification — enough for cells, not so much it’s finicky" },
  { label: "C", text: "Rechargeable USB-C — 4 hours of exploration per charge" },
  { label: "D", text: "Focus wheel — the ribbed grip means muddy fingers still work it" },
  { label: "E", text: "Save & share — take photos, watch back on the screen" },
  { label: "F", text: "Wrist strap — because it will get dropped" },
];

const specs = [
  { heading: "DIMENSIONS", items: ["9 × 6 × 4 cm", "185 g", "Ages 5–12"] },
  { heading: "BATTERY", items: ["Rechargeable", "4 hr runtime", "USB-C charge"] },
  { heading: "IN THE BOX", items: ["Microscope", "USB-C cable", "Wrist strap", "Cleaning cloth", "Field guide card"] },
];

export default function Instrument() {
  return (
    <section id="instrument" className="relative bg-paper-bone py-[var(--space-9)] md:py-[var(--space-10)]">
      <div className="w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-16">
        <Eyebrow className="mb-6">02 &middot; THE INSTRUMENT</Eyebrow>
        <h2 className="text-h2 text-ink mb-16 md:mb-24">
          Built like a tool.<br />Sized like a toy.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10 mb-20 md:mb-28">
          {features.map((f) => (
            <div key={f.label} className="flex gap-4">
              <span className="text-caption text-wattle flex-shrink-0 mt-1 w-6">{f.label}</span>
              <div className="border-l border-ink/15 pl-4">
                <p className="font-body text-base text-ink/80 leading-relaxed">{f.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-ink/15 pt-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 md:gap-12">
            {specs.map((col) => (
              <div key={col.heading}>
                <h4 className="text-caption text-ink/50 mb-4">{col.heading}</h4>
                <ul className="space-y-2">
                  {col.items.map((item) => (
                    <li key={item} className="font-utility text-sm md:text-base text-ink/70">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
