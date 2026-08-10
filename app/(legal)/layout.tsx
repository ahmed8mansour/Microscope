import Link from "next/link";
import Footer from "@/components/sections/Footer";

// Shared shell for the legal / policy pages (privacy, terms, refund). Uses the
// storefront "Field Notes" paper aesthetic and the same Footer as the landing
// page so the nav stays in sync everywhere.
export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen flex flex-col bg-paper-bone">
      <header className="border-b border-ink/15">
        <div className="w-full max-w-3xl mx-auto px-6 md:px-8 py-6">
          <Link
            href="/"
            className="text-caption text-ink/50 hover:text-ink transition-colors"
          >
            &larr; The Field Microscope
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 md:px-8 py-12 md:py-16">
        {children}
      </main>

      <Footer />
    </div>
  );
}
