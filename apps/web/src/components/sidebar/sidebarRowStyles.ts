// The open thread's row is lit like the open tab. Its children re-point the text tokens at the
// inverted colors, so every label, light and action inside reads on the light fill.
export const SIDEBAR_ACTIVE_ROW_CLASS =
  "bg-sidebar-foreground text-sidebar *:[--contrast-foreground:var(--sidebar)] *:[--contrast-sidebar-foreground:var(--sidebar)] *:[--contrast-muted-foreground:color-mix(in_oklab,var(--sidebar)_68%,var(--sidebar-foreground))] *:[--contrast-sidebar-muted-foreground:color-mix(in_oklab,var(--sidebar)_68%,var(--sidebar-foreground))] *:[--contrast-secondary-label:color-mix(in_oklab,var(--sidebar)_68%,var(--sidebar-foreground))] *:[--contrast-placeholder:color-mix(in_oklab,var(--sidebar)_68%,var(--sidebar-foreground))]";
