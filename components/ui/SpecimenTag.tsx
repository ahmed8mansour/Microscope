"use client";

interface SpecimenTagProps {
  number: string;
  latin: string;
  common: string;
  magnification?: string;
  location?: string;
  className?: string;
}

export default function SpecimenTag({
  number,
  latin,
  common,
  magnification,
  location,
  className = "",
}: SpecimenTagProps) {
  return (
    <div className={`max-w-sm ${className}`}>
      <p className="text-caption text-wattle mb-1">{number}</p>
      <p className="font-display italic text-lg md:text-xl">{latin}</p>
      <p className="font-body text-base opacity-80">{common}</p>
      <div className="w-full h-px bg-ink/40 my-3" />
      {magnification && (
        <p className="text-caption text-ink/60">Magnification: {magnification}</p>
      )}
      {location && (
        <p className="text-caption text-ink/60 mt-0.5">Location: {location}</p>
      )}
    </div>
  );
}
