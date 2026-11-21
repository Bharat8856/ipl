import { FranchiseCode } from '../shared/types';
import { FRANCHISE_MAP } from '../shared/franchises';

interface FranchiseBadgeProps {
  code: FranchiseCode;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const SIZE_MAP = {
  xs: { box: 'w-6 h-6', text: 'text-[10px]' },
  sm: { box: 'w-8 h-8', text: 'text-xs' },
  md: { box: 'w-11 h-11', text: 'text-sm' },
  lg: { box: 'w-14 h-14', text: 'text-base' },
};

export function FranchiseBadge({ code, size = 'md' }: FranchiseBadgeProps) {
  const f = FRANCHISE_MAP[code];
  const dims = SIZE_MAP[size];

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${dims.box}`}
      title={f.name}
      aria-label={f.name}
    >
      <svg viewBox="0 0 44 44" className="w-full h-full drop-shadow-xs" aria-hidden="true">
        <path
          d="M22 3 L38 9 V22 C38 31.5 31 38 22 41 C13 38 6 31.5 6 22 V9 Z"
          fill={f.primaryColor}
          stroke={f.secondaryColor}
          strokeWidth="2.4"
        />
        <path
          d="M11 12.5 L22 8.2 L33 12.5"
          fill="none"
          stroke={f.secondaryColor}
          strokeOpacity="0.65"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-display font-extrabold tracking-tight leading-none ${dims.text}`}
        style={{ color: f.textOnPrimary }}
      >
        {f.code}
      </span>
    </div>
  );
}
