import { Caveat, Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";

export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

export const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Handwriting — used only for the small handwritten notes.
export const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  weight: ["600"],
  display: "swap",
});
