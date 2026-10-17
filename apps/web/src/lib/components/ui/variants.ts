export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";
export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const BUTTON_BASE = `inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 ${FOCUS}`;

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary:
    "border border-border-strong bg-surface text-text hover:bg-surface-sunken",
  ghost: "text-text-muted hover:bg-surface-sunken hover:text-text",
  danger: "bg-danger-soft text-danger hover:brightness-95",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4 text-sm",
};

const ICON_BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "size-8 text-sm",
  md: "size-9 text-sm",
};

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export const CONTROL_CLASSES = `w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-subtle aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;

export function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  iconOnly = false,
): string {
  const sizes = iconOnly ? ICON_BUTTON_SIZES : BUTTON_SIZES;
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${sizes[size]}`;
}

export function badgeClasses(tone: BadgeTone): string {
  return `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`;
}
