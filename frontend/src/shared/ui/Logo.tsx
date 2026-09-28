import clsx from 'clsx';
import { getAppDisplayName, type BrandWordmarkOptions } from '@/shared/lib/appBranding';

interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  animate?: boolean;
  className?: string;
}

const sizeMap = {
  xs: 'h-5 w-5',
  sm: 'h-6 w-6',
  md: 'h-7 w-7',
  lg: 'h-10 w-10',
  xl: 'h-14 w-14',
};

/**
 * CivilCore brand mark — bridge + road on sky-to-orange gradient.
 */
export function Logo({ size = 'md', animate = false, className }: LogoProps) {
  const gradientId = `cc-lg-${size}-${animate ? 'a' : 's'}`;

  const archStyle = animate
    ? {
        animation: `oeBuildingSlide 600ms cubic-bezier(0.22,1,0.36,1) both`,
        animationDelay: '180ms',
        transformOrigin: 'center',
      }
    : undefined;

  const roadStyle = animate
    ? {
        transformOrigin: 'bottom',
        animation: `oeBarGrow 500ms cubic-bezier(0.34,1.56,0.64,1) both`,
        animationDelay: '260ms',
      }
    : undefined;

  const bgStyle = animate
    ? {
        animation: `oeBgScale 450ms cubic-bezier(0.34,1.56,0.64,1) both`,
      }
    : undefined;

  return (
    <div
      className={clsx(sizeMap[size], 'relative shrink-0', className)}
      style={
        animate
          ? {
              animation:
                'oeLogoFloat 3s ease-in-out 1.2s infinite, oeLogoGlow 3s ease-in-out 1.2s infinite',
            }
          : undefined
      }
    >
      <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0B3A6E" />
            <stop offset="55%" stopColor="#0d457f" />
            <stop offset="100%" stopColor="#E87722" />
          </linearGradient>
        </defs>

        <rect x="32" y="32" width="448" height="448" rx="96" fill={`url(#${gradientId})`} style={bgStyle} />

        <path
          d="M128 320 Q256 200 384 320"
          stroke="#fff"
          strokeWidth="28"
          strokeLinecap="round"
          fill="none"
          opacity="0.95"
          style={archStyle}
        />

        <path
          d="M96 360 L416 360 L384 420 L128 420 Z"
          fill="#fff"
          opacity="0.92"
          style={roadStyle}
        />

        <rect
          x="248"
          y="368"
          width="16"
          height="44"
          rx="4"
          fill={`url(#${gradientId})`}
          opacity="0.35"
          style={roadStyle}
        />
      </svg>
    </div>
  );
}

interface LogoWithTextProps extends LogoProps {
  /** When true, shows legacy grey "ERP" suffix only for OpenConstructionERP name. */
  showVersion?: boolean;
}

const textSizeMap = {
  xs: 'text-[15px] leading-none',
  sm: 'text-[16px] leading-none',
  md: 'text-[17px] leading-none',
  lg: 'text-xl leading-none',
  xl: 'text-2xl leading-none',
};

const gapSizeMap = {
  xs: 'gap-1.5',
  sm: 'gap-2',
  md: 'gap-2',
  lg: 'gap-2.5',
  xl: 'gap-3',
};

function BrandWordmark({
  showLegacyErpSuffix = true,
}: BrandWordmarkOptions) {
  const name = getAppDisplayName();

  if (name.includes('PWD Delhi') || name.startsWith('PWD')) {
    return (
      <>
        <span className="text-[#0B3A6E]">PWD Delhi</span>
        <span className="text-content-tertiary font-semibold text-[0.85em]"> · Works</span>
      </>
    );
  }

  if (name === 'CivilCore') {
    return (
      <>
        Civil<span className="text-[#E87722]">Core</span>
      </>
    );
  }

  if (name === 'OpenConstructionERP' && showLegacyErpSuffix) {
    return (
      <>
        Open<span className="text-oe-blue">Construction</span>
        <span className="text-content-quaternary font-semibold">ERP</span>
      </>
    );
  }

  return <>{name}</>;
}

export function LogoWithText({
  size = 'md',
  animate,
  showVersion = true,
  className,
}: LogoWithTextProps) {
  return (
    <div className={clsx('flex items-center', gapSizeMap[size], className)}>
      <Logo size={size} animate={animate} />
      <span
        className={clsx(
          textSizeMap[size],
          'font-extrabold text-content-primary whitespace-nowrap tracking-tight',
        )}
        style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", letterSpacing: '-0.02em' }}
      >
        <BrandWordmark showLegacyErpSuffix={showVersion} />
      </span>
    </div>
  );
}
