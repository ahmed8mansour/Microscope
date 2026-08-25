"use client";

interface SpecimenTagProps extends React.HTMLAttributes<HTMLDivElement> {
  number: string;
  latin: string;
  common: string;
  magnification?: string;
  location?: string;
}

export default function SpecimenTag({
  number,
  latin,
  common,
  magnification,
  location,
  className = "",
  ...rest
}: SpecimenTagProps) {
  return (
    <div className={`max-w-sm ${className}`} {...rest}>
      <p className="text-caption text-wattle-ink mb-1">{number}</p>
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
