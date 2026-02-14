import { Minus, Square, XIcon } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';

export function WindowControls() {
  if (!IS_ELECTRON || IS_MAC) return null;

  return (
    <>
      {/* Divider before window controls */}
      <div className="w-px h-5 bg-border mx-1" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.electronAPI?.window.minimize()}
              className="w-7 h-7"
              aria-label="Minimize"
            >
              <Minus size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Minimize</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.electronAPI?.window.maximize()}
              className="w-7 h-7"
              aria-label="Maximize"
            >
              <Square size={12} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Maximize</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.electronAPI?.window.close()}
              className="w-7 h-7 hover:bg-destructive/20 hover:text-destructive"
              aria-label="Close"
            >
              <XIcon size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close</TooltipContent>
        </Tooltip>
      </div>
    </>
  );
}
