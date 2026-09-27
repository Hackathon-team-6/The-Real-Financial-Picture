import { ShieldCheck } from "lucide-react";

export function PrivacyNote({ className = "" }: { className?: string }) {
  return (
    <section className={`rounded-[var(--radius-card)] border border-line bg-card p-5 ${className}`}>
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-pos" />
        <h3 className="text-[15px] font-semibold tracking-tight">Privacy by design</h3>
      </div>
      <p className="mt-2 text-[13.5px] text-muted">Financial X-Ray works from statements you choose to upload. We never need:</p>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13.5px] text-ink">
        <li>• Bank passwords</li>
        <li>• Card PINs</li>
        <li>• OTPs</li>
        <li>• Banking logins</li>
      </ul>
      <p className="mt-3 text-[12px] text-subtle">
        In this version, transactions are stored in this browser&apos;s local storage. When you use Ask, a summarized financial model (not your raw transaction
        list) is sent to the assistant.
</p>
    </section>
  );
}
