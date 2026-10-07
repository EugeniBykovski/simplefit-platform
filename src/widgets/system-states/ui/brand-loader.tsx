import { siteConfig } from "@/shared/config/site";
import { cn } from "@/shared/lib/utils";

/**
 * The animated SimpleFit mark of the launch screens (Claude Design LD1/LD3):
 * a spinning ring, a glowing ring box whose four corner posts pulse in turn,
 * the drawn "S" and the wordmark below. Decorative: the launch screen
 * carries the accessible status. Motion stops under prefers-reduced-motion.
 */
export function BrandLoader({ className }: { className?: string }) {
  const [brand, ...sport] = siteConfig.name.split(" ");

  return (
    <div aria-hidden className={cn("flex flex-col items-center gap-6", className)}>
      <div className="relative flex size-55 items-center justify-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full animate-system-spin">
          <circle cx="50" cy="50" r="47" fill="none" className="stroke-border" strokeWidth="1.6" />
          <circle
            cx="50"
            cy="50"
            r="47"
            fill="none"
            className="stroke-highlight"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray="46 250"
          />
        </svg>
        <span className="absolute size-37.5 animate-system-glow rounded-full bg-system-mark-glow" />
        <svg viewBox="0 0 64 64" fill="none" className="relative size-37.5">
          <rect
            x="6"
            y="6"
            width="52"
            height="52"
            rx="14"
            className="stroke-foreground"
            strokeWidth="3.5"
          />
          {[
            [10.1, 10.1, "[animation-delay:0s]"],
            [53.9, 10.1, "[animation-delay:0.4s]"],
            [53.9, 53.9, "[animation-delay:0.8s]"],
            [10.1, 53.9, "[animation-delay:1.2s]"],
          ].map(([cx, cy, delay]) => (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r="3.4"
              className={cn("animate-system-post fill-highlight", delay as string)}
            />
          ))}
          <path
            d="M44 20H26a6 6 0 0 0 0 12h12a6 6 0 0 1 0 12H29"
            className="animate-system-draw stroke-highlight"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="44" cy="20" r="5.5" className="fill-highlight" />
          <circle cx="20" cy="44" r="4.6" className="stroke-accent-foreground" strokeWidth="2.8" />
        </svg>
      </div>
      <div className="flex flex-col items-center gap-2">
        <span className="type-wordmark text-foreground">{brand}</span>
        <span className="pl-1.5 type-label-wide text-highlight">{sport.join(" ")}</span>
      </div>
    </div>
  );
}
