"use client";

const testimonials = [
  {
    date: "09.MAR.2026",
    location: "Melbourne, VIC",
    quote:
      "“My seven-year-old took it into the garden and didn’t come back inside for four hours. That’s the review.”",
    name: "Sarah T.",
  },
  {
    date: "22.FEB.2026",
    location: "Brisbane, QLD",
    quote:
      "“Bought this for my grandson thinking it was a toy. It’s a real microscope. He’s shown me things about my own backyard I didn’t know were there.”",
    name: "Peter M.",
  },
  {
    date: "14.APR.2026",
    location: "Perth, WA",
    quote:
      "“Solid build. Survived a full week of camping, including being dropped on granite. Screen is sharper than I expected at this price.”",
    name: "Amelia K.",
  },
];

export default function FieldReports() {
  return (
    <section
      id="field-reports"
      className="relative bg-eucalypt text-paper-bone py-[var(--space-9)] md:py-[var(--space-10)]"
    >
      <div className="w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="border border-paper-bone/15 p-6 md:p-8"
            >
              <div className="text-caption text-paper-bone/50 mb-1">
                FIELD REPORT &middot; {t.date}
              </div>
              <div className="text-caption text-paper-bone/40 mb-6">
                Verified purchase &middot; {t.location}
              </div>

              <blockquote className="font-body text-base md:text-lg text-paper-bone/90 leading-relaxed mb-6">
                {t.quote}
              </blockquote>

              <p className="font-body text-sm text-paper-bone/60">
                &mdash; {t.name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
