"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import SmoothScrollProvider from "@/components/ui/SmoothScrollProvider";
import CursorLens from "@/components/ui/CursorLens";
import FocusHUD from "@/components/ui/FocusHUD";
import Hero from "@/components/sections/Hero";
import Premise from "@/components/sections/Premise";
import Instrument from "@/components/sections/Instrument";
import FieldReports from "@/components/sections/FieldReports";
import Offer from "@/components/sections/Offer";
import Footer from "@/components/sections/Footer";
import { trackFunnelEvent } from "@/features/analytics/lib/track";

const ProductScene = dynamic(() => import("@/components/scene/ProductScene"), {
  ssr: false,
});

const SpecimenJourney = dynamic(
  () => import("@/components/scene/SpecimenJourney"),
  { ssr: false }
);

export default function Home() {
  // Funnel entry (FR-026) — fire-and-forget, once per mount; never blocks
  // or delays the landing page.
  useEffect(() => {
    trackFunnelEvent("entry");
  }, []);

  return (
    <SmoothScrollProvider>
      <CursorLens />
      <FocusHUD />
      <ProductScene />
      <main data-theme="dark" className="relative bg-paper-bone">
        <Hero />
        <Premise />
        <SpecimenJourney />
        <Instrument />
        <FieldReports />
        <Offer />
        <Footer />
      </main>
    </SmoothScrollProvider>
  );
}
