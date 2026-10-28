import { SquarePenIcon } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function UnsentDraftLabel(props: { readonly testId?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label="Unsent draft"
            data-testid={props.testId}
            className="inline-flex shrink-0 items-center gap-0.5 text-warning-foreground"
          />
        }
      >
        <SquarePenIcon aria-hidden className="size-[1.1em] shrink-0" />
        Draft
      </TooltipTrigger>
      <TooltipPopup side="top">Unsent draft</TooltipPopup>
    </Tooltip>
  );
}
