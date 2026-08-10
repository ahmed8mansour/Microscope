"use client";

import Eyebrow from "@/components/ui/Eyebrow";

export default function Premise() {
  return (
    <section
      id="premise"
      className="relative min-h-dvh flex items-center bg-eucalypt text-paper-bone overflow-hidden"
    >
      <div className="w-full max-w-7xl mx-auto px-5 sm:px-8 md:px-12 lg:px-16 py-[var(--space-9)] md:py-[var(--space-10)]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left — text. Below lg the product no longer travels here; on lg it lands on the right. */}
          <div className="max-w-xl">
            <Eyebrow className="!text-paper-bone/60 mb-8">
              01 &middot; THE PREMISE
            </Eyebrow>

            <h2 className="text-h2 text-paper-bone mb-8">
              Kids look at screens for six hours a day. They can&rsquo;t name
              the tree in their front yard.
            </h2>

            <p className="font-body text-base md:text-lg text-paper-bone/80 leading-relaxed max-w-md">
              Not a fault of the kid. The world&rsquo;s most interesting parts
              are too small to notice with the naked eye. A microscope
              isn&rsquo;t a science tool &mdash; it&rsquo;s a permission slip to
              look closer.
            </p>
          </div>

          {/* Right — reserved for the 3D product */}
          <div aria-hidden className="hidden lg:block" />
        </div>
      </div>
    </section>
  );
}
