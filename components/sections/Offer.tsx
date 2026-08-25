"use client";

import Eyebrow from "@/components/ui/Eyebrow";
import CTAButton from "@/components/ui/CTAButton";
import { useReveal } from "@/lib/useReveal";
import { formatPrice, formatPriceShort } from "@/lib/config/product";

export default function Offer() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section
      id="offer"
      className="relative bg-paper-bone py-[var(--space-9)] md:py-[var(--space-10)]"
    >
      <div ref={ref} className="w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-16 text-center">
        <Eyebrow data-reveal className="mb-6">03 &middot; TAKE ONE HOME</Eyebrow>

        <h2 data-reveal className="text-h2 text-ink mb-4">Take the lens home.</h2>

        <p data-reveal className="font-body text-base md:text-lg text-ink/60 max-w-md mx-auto mb-10">
          One microscope. A whole world your kid hasn&rsquo;t met yet.
        </p>

        <div data-reveal className="font-utility text-base md:text-lg text-ink/70 space-y-2 mb-10">
          <p className="text-ink text-2xl md:text-3xl font-semibold">
            {formatPrice()}
          </p>
          {/* <p>Free shipping &mdash; Australia-wide</p>
          <p>3&ndash;5 day delivery</p>
          <p>30-day return, no questions</p> */}
        </div>

        <CTAButton href="/checkout" className="mb-4">
          Buy now &mdash; {formatPriceShort()}
        </CTAButton>

        {/* <p className="font-body text-sm text-ink/50 mt-4">
          Or gift it &mdash; we&rsquo;ll include a hand-numbered field card
        </p> */}
      </div>
    </section>
  );
}
