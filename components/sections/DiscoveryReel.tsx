"use client";

import SpecimenTag from "@/components/ui/SpecimenTag";

const specimens = [
  {
    number: "SPEC. 01",
    latin: "Eucalyptus melliodora",
    common: "Yellow Box leaf underside",
    magnification: "60×",
    location: "Yarra Valley, VIC",
    body: "The dots you can’t see are the reason it smells like anything at all. Each one is a pocket of oil the tree makes to keep insects away.",
    textSide: "right" as const,
    image: "https://picsum.photos/seed/yellowbox/600/600?grayscale",
  },
  {
    number: "SPEC. 02",
    latin: "Papilio aegeus",
    common: "Orchard Swallowtail wing scale",
    magnification: "120×",
    location: "Sydney backyard",
    body: "Butterfly wings aren’t painted. They’re tiled. Thousands of scales the size of dust, each one a specific colour, arranged like a mosaic.",
    textSide: "left" as const,
    image: "https://picsum.photos/seed/swallowtail/600/600?grayscale",
  },
  {
    number: "SPEC. 03",
    latin: "Water sample",
    common: "Suburban backyard tap",
    magnification: "60×",
    location: "Melbourne, VIC",
    body: "Even the water you drink has a texture. Minerals, dust, the occasional living thing. All invisible until now.",
    textSide: "right" as const,
    image: "https://picsum.photos/seed/watersample/600/600?grayscale",
  },
];

export default function DiscoveryReel() {
  return (
    <section id="discovery" className="relative bg-paper-bone">
      {specimens.map((spec, i) => {
        const text = (
          <div className={`max-w-lg ${spec.textSide === "left" ? "sm:order-1" : ""}`}>
            <SpecimenTag
              number={spec.number}
              latin={spec.latin}
              common={spec.common}
              magnification={spec.magnification}
              location={spec.location}
              className="mb-8"
            />
            <p className="font-body text-base md:text-lg text-ink/80 leading-relaxed">
              {spec.body}
            </p>
          </div>
        );
        // Media cell. Below the desktop breakpoint it shows a circular static
        // image of the specimen; on lg the circle is hidden and the cell is left
        // empty so the traveling 3D product can occupy this column instead.
        const media = (
          <div className={spec.textSide === "left" ? "sm:order-2" : ""}>
            <div className="lg:hidden aspect-square w-48 sm:w-full sm:max-w-sm sm:mx-auto rounded-full overflow-hidden bg-ink/5 ring-1 ring-ink/10">
              <img
                src={spec.image}
                alt={spec.common}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        );

        return (
          <div
            key={i}
            className="min-h-dvh flex items-center py-[var(--space-9)] md:py-[var(--space-10)]"
          >
            <div className="w-full max-w-7xl mx-auto px-5 sm:px-8 md:px-12 lg:px-16">
              {/* Media first in the DOM so phone always stacks the pic above the
                  text; sm:order-* recreates the left/right zigzag from tablet up. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 sm:gap-12 items-center">
                {media}
                {text}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
