"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import SmoothScrollProvider from "@/components/ui/SmoothScrollProvider";
import Hero from "@/components/sections/Hero";
import Premise from "@/components/sections/Premise";
import DiscoveryReel from "@/components/sections/DiscoveryReel";
import Instrument from "@/components/sections/Instrument";
import FieldReports from "@/components/sections/FieldReports";
import Offer from "@/components/sections/Offer";
import Footer from "@/components/sections/Footer";
import { trackFunnelEvent } from "@/features/analytics/lib/track";

const ProductScene = dynamic(() => import("@/components/scene/ProductScene"), {
  ssr: false,
});

export default function Home() {
  // Funnel entry (FR-026) — fire-and-forget, once per mount; never blocks
  // or delays the landing page.
  useEffect(() => {
    trackFunnelEvent("entry");
  }, []);

  return (
    <SmoothScrollProvider>
      <ProductScene />
      <main className="relative">
        <Hero />
        <Premise />
        <DiscoveryReel />
        <Instrument />
        <FieldReports />
        <Offer />
        <Footer />
      </main>
    </SmoothScrollProvider>
  );
}
