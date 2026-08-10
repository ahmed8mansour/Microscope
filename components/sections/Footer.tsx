import Link from "next/link";
import { getWhatsAppSupportUrl } from "@/lib/config/support";

export default function Footer() {
  return (
    <footer className="bg-paper-bone border-t border-ink/15 py-8">
      <div className="w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-16 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-caption text-ink/40">
          &copy; 2026 &middot; Field Notes &middot; Made in Melbourne
        </p>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link
            href="/refund-policy"
            className="text-caption text-ink/40 hover:text-ink/70 transition-colors"
          >
            Returns
          </Link>
          <Link
            href="/terms"
            className="text-caption text-ink/40 hover:text-ink/70 transition-colors"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="text-caption text-ink/40 hover:text-ink/70 transition-colors"
          >
            Privacy
          </Link>
          <a
            href={getWhatsAppSupportUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="text-caption text-ink/40 hover:text-ink/70 transition-colors"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
