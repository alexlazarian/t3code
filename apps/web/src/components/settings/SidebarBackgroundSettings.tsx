import type { CSSProperties } from "react";
import { useRef, useState } from "react";

import { useActiveSidebarBackgroundThemeKey } from "../../hooks/useActiveSidebarBackground";
import { hexToHsv, hsvToHex, type HsvColor } from "../../lib/color";
import {
  MAX_SIDEBAR_BACKGROUND_TILE_SIZE,
  MIN_SIDEBAR_BACKGROUND_TILE_SIZE,
  removeSidebarBackgrounds,
  SIDEBAR_BACKGROUND_ACCEPT,
  setSidebarBackgroundImage,
  updateSidebarBackgroundSettings,
  useSidebarBackground,
  type SidebarBackgroundFit,
} from "../../sidebarBackground";
import { getThemeDefinition } from "../../themePalette";
import { SidebarBackgroundArt } from "../sidebar/SidebarBackgroundLayer";
import { Button } from "../ui/button";
import { ColorHueSlider, ColorSaturationValuePlane } from "../ui/color-picker";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const FIT_LABELS: Record<SidebarBackgroundFit, string> = {
  cover: "Cover",
  tile: "Tile",
};

function themeLabel(themeKey: string): string {
  if (themeKey === "light") return "Default light";
  if (themeKey === "dark") return "Default dark";
  return getThemeDefinition(themeKey)?.label ?? themeKey;
}

function SettingsSlider(props: {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly unit: string;
  readonly onChange: (value: number) => void;
}) {
  const ratio = (props.value - props.min) / (props.max - props.min);
  const style = {
    "--settings-slider-progress": `${ratio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - ratio}rem`,
  } as CSSProperties;
  return (
    <div className="flex w-full items-center gap-3 sm:w-52">
      <output
        className="min-w-14 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
        htmlFor={props.id}
      >
        {props.value}
        {props.unit}
      </output>
      <input
        aria-label={props.label}
        className="settings-slider min-w-0 flex-1"
        id={props.id}
        max={props.max}
        min={props.min}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
        step={props.step}
        style={style}
        type="range"
        value={props.value}
      />
    </div>
  );
}

function OverlayColorPicker(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(props.value));
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const commitHsv = (next: HsvColor) => {
    setHsv(next);
    props.onChange(hsvToHex(next.h, next.s, next.v));
  };

  return (
    <div className="flex w-full items-center gap-2 sm:w-52">
      <Popover
        onOpenChange={(open) => {
          if (open) setHsv(hexToHsv(props.value));
        }}
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              style={{ backgroundColor: props.value }}
              aria-label="Pick overlay color"
            />
          }
        />
        <PopoverPopup side="bottom" align="start" sideOffset={6} padding="none">
          <div className="w-56 bg-popover">
            <ColorSaturationValuePlane
              label="Overlay color"
              value={hsv}
              onChange={commitHsv}
              variant="edge"
            />
            <div className="p-3">
              <ColorHueSlider
                label="Overlay color hue"
                value={hsv.h}
                onChange={(h) => commitHsv({ ...hsv, h })}
              />
            </div>
          </div>
        </PopoverPopup>
      </Popover>
      <Input
        nativeInput
        size="compact"
        value={hexDraft ?? props.value}
        onChange={(event) => {
          const next = event.currentTarget.value.trim();
          setHexDraft(next);
          if (/^#[\da-f]{6}$/i.test(next)) props.onChange(next.toLowerCase());
        }}
        onBlur={() => setHexDraft(null)}
        font="mono"
        aria-label="Overlay hex color"
        spellCheck={false}
      />
    </div>
  );
}

export function SidebarBackgroundSettings() {
  const themeKey = useActiveSidebarBackgroundThemeKey();
  const background = useSidebarBackground(themeKey);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const update = (patch: Parameters<typeof updateSidebarBackgroundSettings>[1]) =>
    updateSidebarBackgroundSettings(themeKey, patch);

  const chooseFile = async (file: File) => {
    setIsSaving(true);
    try {
      await setSidebarBackgroundImage(themeKey, file);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not use that image",
        description: error instanceof Error ? error.message : "The file could not be read.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const remove = () => {
    removeSidebarBackgrounds([themeKey]).catch(() => {
      toastManager.add({ type: "error", title: "Could not remove the sidebar background" });
    });
  };

  return (
    <SettingsSection id="sidebar-background-section" title="Sidebar background">
      <SettingsRow
        {...searchableSetting("sidebar-background")}
        description={`A picture or SVG behind the sidebar for the ${themeLabel(themeKey)} theme. Each theme keeps its own background on this device.`}
        control={
          <div className="flex items-center gap-2">
            {background ? (
              <div className="relative h-9 w-6 shrink-0 overflow-hidden rounded-sm border border-border bg-sidebar">
                <SidebarBackgroundArt background={background} />
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept={SIDEBAR_BACKGROUND_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void chooseFile(file);
              }}
            />
            <Button
              size="xs"
              variant="outline"
              disabled={isSaving}
              onClick={() => fileInputRef.current?.click()}
            >
              {background ? "Replace image" : "Choose image"}
            </Button>
            {background ? (
              <Button size="xs" variant="ghost-destructive" onClick={remove}>
                Remove
              </Button>
            ) : null}
          </div>
        }
      />
      {background ? (
        <>
          <SettingsRow
            title="Fit"
            description="Cover fills the sidebar with one copy. Tile repeats it, which suits patterns."
            control={
              <Select
                value={background.settings.fit}
                onValueChange={(value) => {
                  if (value === "cover" || value === "tile") update({ fit: value });
                }}
              >
                <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Background fit">
                  <SelectValue>{FIT_LABELS[background.settings.fit]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {Object.entries(FIT_LABELS).map(([value, label]) => (
                    <SelectItem hideIndicator key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
          {background.settings.fit === "tile" ? (
            <SettingsRow
              title="Tile size"
              description="Width of one repeat of the image."
              control={
                <SettingsSlider
                  id="sidebar-background-tile-size"
                  label="Tile size"
                  min={MIN_SIDEBAR_BACKGROUND_TILE_SIZE}
                  max={MAX_SIDEBAR_BACKGROUND_TILE_SIZE}
                  step={4}
                  unit="px"
                  value={background.settings.tileSize}
                  onChange={(tileSize) => update({ tileSize })}
                />
              }
            />
          ) : null}
          <SettingsRow
            title="Image opacity"
            control={
              <SettingsSlider
                id="sidebar-background-image-opacity"
                label="Image opacity"
                min={0}
                max={100}
                step={5}
                unit="%"
                value={background.settings.imageOpacity}
                onChange={(imageOpacity) => update({ imageOpacity })}
              />
            }
          />
        </>
      ) : null}
      {background ? (
        <>
          <SettingsRow
            title="Overlay color"
            description="Tints the image so sidebar text stays readable."
            control={
              <OverlayColorPicker
                value={background.settings.overlayColor}
                onChange={(overlayColor) => update({ overlayColor })}
              />
            }
          />
          <SettingsRow
            title="Overlay opacity"
            control={
              <SettingsSlider
                id="sidebar-background-overlay-opacity"
                label="Overlay opacity"
                min={0}
                max={100}
                step={5}
                unit="%"
                value={background.settings.overlayOpacity}
                onChange={(overlayOpacity) => update({ overlayOpacity })}
              />
            }
          />
        </>
      ) : null}
    </SettingsSection>
  );
}
