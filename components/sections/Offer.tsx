"use client";

import Eyebrow from "@/components/ui/Eyebrow";
import CTAButton from "@/components/ui/CTAButton";
import { formatPrice, formatPriceShort } from "@/lib/config/product";

export default function Offer() {
  return (
    <section
      id="offer"
      className="relative bg-paper-bone py-[var(--space-9)] md:py-[var(--space-10)]"
    >
      <div className="w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-16 text-center">
        <Eyebrow className="mb-6">03 &middot; TAKE ONE HOME</Eyebrow>

        <h2 className="text-h2 text-ink mb-10">The Field Microscope</h2>

        <div className="font-utility text-base md:text-lg text-ink/70 space-y-2 mb-10">
          <p className="text-ink text-2xl md:text-3xl font-semibold">
            {formatPrice()}
          </p>
          {/* <p>Free shipping &mdash; Australia-wide</p>
          <p>3&ndash;5 day delivery</p>
          <p>30-day return, no questions</p> */}
        </div>

        <CTAButton href="/checkout" className="mb-4">
          Add to cart &mdash; {formatPriceShort()}
        </CTAButton>

        {/* <p className="font-body text-sm text-ink/50 mt-4">
          Or gift it &mdash; we&rsquo;ll include a hand-numbered field card
        </p> */}
      </div>
    </section>
  );
}
