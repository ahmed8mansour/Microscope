import type { Metadata } from "next";
import Link from "next/link";
import {
  getWhatsAppSupportUrl,
  getWhatsAppSupportNumber,
} from "@/lib/config/support";

export const metadata: Metadata = {
  title: "Terms & Conditions — The Field Microscope",
  description:
    "The terms that apply when you buy from The Field Microscope.",
};

export default function TermsPage() {
  const waUrl = getWhatsAppSupportUrl();
  const waNumber = getWhatsAppSupportNumber();

  return (
    <article>
      <h1 className="text-h2 font-display mb-2">Terms &amp; Conditions</h1>
      <p className="text-caption text-ink/50 mb-10">Last updated: 10 August 2026</p>

      <div className="legal-prose">
        <p>
          These Terms &amp; Conditions apply to your use of this store and to
          any order you place with us. By placing an order, you agree to these
          terms. Please read them carefully.
        </p>

        <h2>Who we are</h2>
        <p>
          This store is operated by <strong>Ahmed Alshurafa</strong>, an
          Australian-based sole trader (&ldquo;we&rdquo;, &ldquo;us&rdquo;,
          &ldquo;our&rdquo;). You can contact us any time using the details at
          the bottom of this page.
        </p>

        <h2>The product and price</h2>
        <p>
          We sell the Field Microscope for <strong>AUD&nbsp;$59.00</strong> per
          unit. Prices are shown in Australian dollars (AUD). We may update the
          price or product details at any time, but changes will not affect an
          order we have already accepted.
        </p>

        <h2>Orders and payment</h2>
        <p>
          When you place an order, you are making an offer to buy. Your order is
          accepted once your payment has been successfully processed. Payment is
          taken at checkout in Australian dollars. We reserve the right to
          decline or cancel an order &mdash; for example, if the item is
          unavailable or we suspect fraud &mdash; in which case we will refund
          any payment taken.
        </p>

        <h2>Shipping</h2>
        <p>
          We ship to a wide range of countries. Delivery times vary depending on
          your location and can take some time, so please allow for this when
          ordering. Any customs charges, duties, or import taxes that may apply
          in your country are your responsibility.
        </p>

        <h2>Your consumer rights</h2>
        <p>
          Our goods come with guarantees that cannot be excluded under the
          Australian Consumer Law. Nothing in these terms limits or removes any
          right you have under that law. For details on returns and refunds,
          please see our{" "}
          <Link href="/refund-policy">Refund Policy</Link>.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the extent permitted by law, and without limiting your rights under
          the Australian Consumer Law, we are not liable for any indirect or
          consequential loss arising from your use of the product or this store.
        </p>

        <h2>Privacy</h2>
        <p>
          We handle your personal information in line with our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of Victoria, Australia, and you
          agree to the non-exclusive jurisdiction of the courts of that state.
        </p>

        <h2>Contact us</h2>
        <p>
          <a href={waUrl} target="_blank" rel="noopener noreferrer">
            Message us on WhatsApp{waNumber ? ` (${waNumber})` : ""}
          </a>
        </p>
      </div>
    </article>
  );
}
