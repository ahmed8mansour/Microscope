import { formatPrice } from "@/lib/config/product";

// Contact-step decoration, large screens only: the microscope inside soft
// rings, a handwritten note and a product card. Purely presentational.
export default function CheckoutShowcase() {
  return (
    <div aria-hidden className="relative hidden h-[600px] lg:block">
      <div className="absolute left-1/2 top-[44%] h-[516px] w-[516px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[rgba(11,122,108,0.18)]" />
      <div className="absolute left-1/2 top-[44%] h-[408px] w-[408px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[rgba(11,122,108,0.35)]" />
      <div className="absolute left-1/2 top-[44%] h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#CDEFE0]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/checkout-microscope.png"
        alt=""
        width={338}
        height={420}
        className="absolute left-1/2 top-[44%] h-[420px] w-[338px] -translate-x-1/2 -translate-y-1/2 rotate-[5deg] [filter:drop-shadow(0_30px_28px_rgba(0,0,0,0.28))]"
      />
      <span className="nb-hand absolute left-[-24px] top-[80%] -rotate-[4deg] text-[30px]">Look closer</span>
      <div className="co-card absolute bottom-0 left-1/2 flex w-[380px] -translate-x-1/2 items-center gap-4 !rounded-full !px-6 !py-4">
        <span className="inline-flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full bg-leaf-chip text-leaf-accent">
          <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="m7.5 4.27 9 5.15" />
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
          </svg>
        </span>
        <div>
          <div className="text-[18px] font-semibold text-ink">The Field Microscope</div>
          <div className="font-mono text-[14px] text-leaf-muted">{formatPrice()}</div>
        </div>
      </div>
    </div>
  );
}
