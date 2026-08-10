import type { Metadata } from "next";
import { fraunces, instrumentSans, jetbrainsMono } from "./fonts";
import { Analytics } from "@vercel/analytics/next";
import QueryProvider from "@/components/providers/QueryProvider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://fieldmicroscope.com.au"),
  title: "The Field Microscope — See what your kid isn't looking at yet",
  description:
    "A real digital microscope, built to survive a backyard. 60×–120× magnification, 2\" HD screen, $59 shipped anywhere in Australia.",
  openGraph: {
    title: "The Field Microscope — See what your kid isn't looking at yet",
    description:
      "A real digital microscope, built to survive a backyard. 60×–120× magnification, 2\" HD screen, $59 shipped anywhere in Australia.",
    images: ["/images/og-image.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Field Microscope",
    description:
      "A real digital microscope, built to survive a backyard. $59 shipped anywhere in Australia.",
    images: ["/images/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        <QueryProvider>
          {children}
          <Analytics />
        </QueryProvider>
      </body>
    </html>
  );
}
