import type { Metadata } from "next";
import {
  getWhatsAppSupportUrl,
  getWhatsAppSupportNumber,
} from "@/lib/config/support";

export const metadata: Metadata = {
  title: "Privacy Policy — The Field Microscope",
  description:
    "How The Field Microscope collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
  const waUrl = getWhatsAppSupportUrl();
  const waNumber = getWhatsAppSupportNumber();

  return (
    <article>
      <h1 className="text-h2 font-display mb-2">Privacy Policy</h1>
      <p className="text-caption text-ink/50 mb-10">Last updated: 10 August 2026</p>

      <div className="legal-prose">
        <p>
          This Privacy Policy explains how we collect, use, and look after your
          personal information when you visit our store or place an order. We
          take your privacy seriously and only collect what we need to run the
          store and get your order to you.
        </p>

        <h2>Information we collect</h2>
        <p>When you shop with us, we may collect:</p>
        <ul>
          <li>Your email address (used to verify your purchase and send your order details).</li>
          <li>Your WhatsApp or phone number (used to contact you about your order).</li>
          <li>Your shipping address (used to deliver your order).</li>
          <li>Your order details (what you bought and when).</li>
          <li>Basic, anonymous usage information that helps us understand how the site is performing.</li>
        </ul>

        <h2>How we use your information</h2>
        <p>We use your information only to:</p>
        <ul>
          <li>Process and confirm your purchase.</li>
          <li>Deliver your order and keep you updated about it.</li>
          <li>Respond to your questions and provide support.</li>
          <li>Keep the store secure and working properly.</li>
        </ul>
        <p>
          <strong>We never sell your personal information</strong>, and we do
          not use it for anything beyond running the store and fulfilling your
          order.
        </p>

        <h2>Payment information</h2>
        <p>
          We do not see or store your full card details. Card payments are
          handled securely and processed off our servers, so your card number
          never reaches us.
        </p>

        <h2>How long we keep your information</h2>
        <p>
          We keep your order information for as long as we need it to run the
          business and meet our legal and tax obligations. You can ask us to
          remove your contact details at any time; where we can, we will remove
          them while keeping the minimum order record the law requires.
        </p>

        <h2>Your choices</h2>
        <p>
          You can ask us to access, correct, or delete the personal information
          we hold about you. To make a request, just get in touch using the
          contact details below.
        </p>

        <h2>Cookies</h2>
        <p>
          We use a small number of cookies to keep the site working and to
          measure, in an anonymous way, how it is used. You can control cookies
          through your browser settings.
        </p>

        <h2>Contact us</h2>
        <p>
          If you have any questions about this policy or your information, reach
          us on WhatsApp:
        </p>
        <p>
          <a href={waUrl} target="_blank" rel="noopener noreferrer">
            Message us on WhatsApp{waNumber ? ` (${waNumber})` : ""}
          </a>
        </p>
      </div>
    </article>
  );
}
