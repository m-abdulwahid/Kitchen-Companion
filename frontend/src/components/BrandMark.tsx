type BrandMarkProps = {
  src: string;
  alt: string;
  className?: string;
};

export function BrandMark({ src, alt, className }: BrandMarkProps) {
  return (
    <img src={src} alt={alt} className={`bg-transparent object-contain ${className ?? ""}`} />
  );
}
