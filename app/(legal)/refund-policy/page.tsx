import type { Metadata } from "next";
import Link from "next/link";
import {
  getWhatsAppSupportUrl,
  getWhatsAppSupportNumber,
} from "@/lib/config/support";

export const metadata: Metadata = {
  title: "Refund & Returns Policy — The Field Microscope",
  description:
    "When and how you can return an item for a refund at The Field Microscope.",
};

export default function RefundPolicyPage() {
  const waUrl = getWhatsAppSupportUrl();
  const waNumber = getWhatsAppSupportNumber();

  return (
    <article>
      <h1 className="text-h2 font-display mb-2">Refund &amp; Returns Policy</h1>
      <p className="text-caption text-ink/50 mb-10">Last updated: 10 August 2026</p>

      <div className="legal-prose">
        <p>
          We want you to be happy with your Field Microscope. This policy
          explains when we accept returns and how to request a refund.
        </p>

        <h2>What we accept returns for</h2>
        <p>
          We only accept returns for items that are{" "}
          <strong>faulty, damaged, or not as described</strong>. If your item
          arrives in any of these conditions, we&rsquo;ll make it right with a
          refund.
        </p>

        <h2>Report it within 14 days</h2>
        <p>
          Please report the problem to us <strong>within 14 days</strong> of
          receiving your order. When you get in touch, let us know your order
          details and, where possible, include photos of the fault or damage so
          we can help you quickly.
        </p>

        <h2>How to request a refund</h2>
        <p>To start a refund request, contact us on WhatsApp:</p>
        <p>
          <a href={waUrl} target="_blank" rel="noopener noreferrer">
            Message us on WhatsApp{waNumber ? ` (${waNumber})` : ""}
          </a>
        </p>

        <h2>How refunds are processed</h2>
        <p>
          Once your return is approved, your refund is issued back to your
          original payment method. It may take a few days to appear, depending
          on your bank or card provider.
        </p>

        <h2>Your consumer rights</h2>
        <p>
          Nothing in this policy limits the guarantees you have under the
          Australian Consumer Law. See our{" "}
          <Link href="/terms">Terms &amp; Conditions</Link> for more.
        </p>
      </div>
    </article>
  );
}
