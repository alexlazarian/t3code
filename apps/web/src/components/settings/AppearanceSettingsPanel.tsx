import type { CSSProperties } from "react";
import { useState } from "react";
import {
  DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE,
  DEFAULT_UNIFIED_SETTINGS,
  type ChatWidth,
  type EnvironmentIdentificationMode,
  MAX_APPEARANCE_CONTRAST,
  MAX_MESSAGE_LINE_HEIGHT,
  MAX_MESSAGE_PARAGRAPH_SPACING,
  MIN_MESSAGE_LINE_HEIGHT,
  MIN_MESSAGE_PARAGRAPH_SPACING,
  MAX_GLASS_OPACITY,
  MAX_PANEL_ANIMATION_DURATION_MS,
  MIN_APPEARANCE_CONTRAST,
  MIN_GLASS_OPACITY,
  MIN_PANEL_ANIMATION_DURATION_MS,
} from "@t3tools/contracts/settings";
import {
  resolveEnvironmentIdentificationPillLabel,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { useCustomThemes } from "../../hooks/useCustomThemes";
import { useTheme } from "../../hooks/useTheme";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SidebarBackgroundSettings } from "./SidebarBackgroundSettings";
import { ThemeLibrary } from "./ThemeSettings";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { AdvancedSettings } from "./AdvancedSettings";
import { PanelAnimationsPreview } from "./PanelAnimationsPreview";
import { useReadingPreview } from "./ReadingPreview";
import { TypographySection } from "./TypographySettings";

const ENVIRONMENT_IDENTIFICATION_LABELS: Record<EnvironmentIdentificationMode, string> = {
  artwork: "Artwork",
  pill: "Version pill",
  none: "None",
};

function RangeControl(props: {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly format: (value: number) => string;
  readonly onChange: (value: number) => void;
  readonly onAdjust?: (anchor: HTMLElement) => void;
  readonly onRelease?: () => void;
}) {
  const ratio = (props.value - props.min) / (props.max - props.min);
  const style = {
    "--settings-slider-progress": `${ratio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - ratio}rem`,
  } as CSSProperties;
  return (
    <div
      className="flex w-full items-center gap-3 sm:w-52"
      onPointerDown={(event) => props.onAdjust?.(event.currentTarget)}
      onPointerUp={() => props.onRelease?.()}
      onPointerCancel={() => props.onRelease?.()}
      onKeyUp={() => props.onRelease?.()}
      onBlur={() => props.onRelease?.()}
    >
      <output
        className="min-w-16 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
        htmlFor={props.id}
      >
        {props.format(props.value)}
      </output>
      <input
        aria-label={props.label}
        className="settings-slider min-w-0 flex-1"
        id={props.id}
        max={props.max}
        min={props.min}
        onChange={(event) => {
          const value = Number(event.currentTarget.value);
          if (Number.isInteger(value) && value >= props.min && value <= props.max) {
            props.onChange(value);
            const control = event.currentTarget.parentElement;
            if (control) props.onAdjust?.(control);
          }
        }}
        step={1}
        style={style}
        type="range"
        value={props.value}
      />
    </div>
  );
}

const CHAT_WIDTH_LABELS: Record<ChatWidth, string> = {
  comfortable: "Comfortable",
  wide: "Wide",
  full: "Full",
};

export function AppearanceSettingsPanel() {
  const {
    appearanceMode,
    refreshTheme,
    resolvedTheme,
    setAppearanceMode,
    setTheme,
    setThemeHalf,
    theme,
    themeHalves,
  } = useTheme();
  const customThemes = useCustomThemes();
  const readingPreview = useReadingPreview();
  const [isImportThemeOpen, setIsImportThemeOpen] = useState(false);
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const environmentStageLabel = useEnvironmentStageLabel();
  const showEnvironmentIdentification =
    resolveEnvironmentIdentificationPillLabel(environmentStageLabel) !== null;
  const glassOpacityRatio =
    (settings.glassOpacity - MIN_GLASS_OPACITY) / (MAX_GLASS_OPACITY - MIN_GLASS_OPACITY);
  const glassOpacitySliderStyle = {
    "--settings-slider-progress": `${glassOpacityRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - glassOpacityRatio}rem`,
  } as CSSProperties;
  const appearanceContrastRatio =
    (settings.appearanceContrast - MIN_APPEARANCE_CONTRAST) /
    (MAX_APPEARANCE_CONTRAST - MIN_APPEARANCE_CONTRAST);
  const appearanceContrastSliderStyle = {
    "--settings-slider-progress": `${appearanceContrastRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - appearanceContrastRatio}rem`,
  } as CSSProperties;
  const panelAnimationDurationRatio =
    (settings.panelAnimationDurationMs - MIN_PANEL_ANIMATION_DURATION_MS) /
    (MAX_PANEL_ANIMATION_DURATION_MS - MIN_PANEL_ANIMATION_DURATION_MS);
  const panelAnimationDurationSliderStyle = {
    "--settings-slider-progress": `${panelAnimationDurationRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - panelAnimationDurationRatio}rem`,
  } as CSSProperties;

  return (
    <SettingsPageContainer>
      <SettingsSection id="appearance" title="Colors & themes" variant="plain" hideTitle>
        <div id={searchableSetting("theme").id}>
          <ThemeLibrary
            appearanceMode={appearanceMode}
            customThemes={customThemes}
            initialAppearance={resolvedTheme}
            refreshTheme={refreshTheme}
            isImportOpen={isImportThemeOpen}
            setAppearanceMode={setAppearanceMode}
            setTheme={setTheme}
            setThemeHalf={setThemeHalf}
            theme={theme}
            themeHalves={themeHalves}
            onImportOpenChange={setIsImportThemeOpen}
          />
        </div>
      </SettingsSection>

      <SidebarBackgroundSettings />

      <SettingsSection id="appearance-interface" title="Interface">
        <SettingsRow
          {...searchableSetting("setting-appearance-contrast")}
          description="Adjust the contrast of colors and borders across the interface."
          resetAction={
            settings.appearanceContrast !== DEFAULT_UNIFIED_SETTINGS.appearanceContrast ? (
              <SettingResetButton
                label="contrast"
                onClick={() =>
                  updateSettings({
                    appearanceContrast: DEFAULT_UNIFIED_SETTINGS.appearanceContrast,
                  })
                }
              />
            ) : null
          }
          control={
            <div className="flex w-full items-center gap-3 sm:w-52">
              <output
                className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                htmlFor="appearance-contrast"
              >
                {settings.appearanceContrast}%
              </output>
              <input
                aria-label="Contrast"
                className="settings-slider min-w-0 flex-1"
                id="appearance-contrast"
                max={MAX_APPEARANCE_CONTRAST}
                min={MIN_APPEARANCE_CONTRAST}
                onChange={(event) => {
                  const appearanceContrast = Number(event.currentTarget.value);
                  if (
                    Number.isInteger(appearanceContrast) &&
                    appearanceContrast >= MIN_APPEARANCE_CONTRAST &&
                    appearanceContrast <= MAX_APPEARANCE_CONTRAST
                  ) {
                    updateSettings({ appearanceContrast });
                  }
                }}
                step={5}
                style={appearanceContrastSliderStyle}
                type="range"
                value={settings.appearanceContrast}
              />
            </div>
          }
        />

        <SettingsRow
          {...searchableSetting("setting-glass-opacity")}
          description="Higher values make menus, dialogs, and the composer more solid."
          resetAction={
            settings.glassOpacity !== DEFAULT_UNIFIED_SETTINGS.glassOpacity ? (
              <SettingResetButton
                label="glass opacity"
                onClick={() =>
                  updateSettings({ glassOpacity: DEFAULT_UNIFIED_SETTINGS.glassOpacity })
                }
              />
            ) : null
          }
          control={
            <div className="flex w-full items-center gap-3 sm:w-52">
              <output
                className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                htmlFor="glass-opacity"
              >
                {settings.glassOpacity}%
              </output>
              <input
                aria-label="Glass opacity"
                className="settings-slider min-w-0 flex-1"
                id="glass-opacity"
                max={MAX_GLASS_OPACITY}
                min={MIN_GLASS_OPACITY}
                onChange={(event) => {
                  const glassOpacity = Number(event.currentTarget.value);
                  if (
                    Number.isInteger(glassOpacity) &&
                    glassOpacity >= MIN_GLASS_OPACITY &&
                    glassOpacity <= MAX_GLASS_OPACITY
                  ) {
                    updateSettings({ glassOpacity });
                  }
                }}
                step={5}
                style={glassOpacitySliderStyle}
                type="range"
                value={settings.glassOpacity}
              />
            </div>
          }
        />

        <SettingsRow
          {...searchableSetting("chat-width")}
          description="Set how wide messages and the composer can grow on large screens."
          resetAction={
            settings.chatWidth !== DEFAULT_UNIFIED_SETTINGS.chatWidth ? (
              <SettingResetButton
                label="chat width"
                onClick={() => updateSettings({ chatWidth: DEFAULT_UNIFIED_SETTINGS.chatWidth })}
              />
            ) : null
          }
          control={
            <div className="w-full sm:w-40">
              <Select
                value={settings.chatWidth}
                onValueChange={(value) => {
                  if (value === "comfortable" || value === "wide" || value === "full")
                    updateSettings({ chatWidth: value });
                }}
              >
                <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Chat width">
                  <SelectValue>{CHAT_WIDTH_LABELS[settings.chatWidth]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="comfortable">Comfortable (default)</SelectItem>
                  <SelectItem value="wide">Wide</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectPopup>
              </Select>
            </div>
          }
        />
        <SettingsRow
          {...searchableSetting("focus-dimming")}
          description="While you write a message, dim everything except the composer. Sending or clicking away brings it back."
          resetAction={
            settings.focusDimming !== DEFAULT_UNIFIED_SETTINGS.focusDimming ? (
              <SettingResetButton
                label="focus dimming"
                onClick={() =>
                  updateSettings({ focusDimming: DEFAULT_UNIFIED_SETTINGS.focusDimming })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.focusDimming}
              onCheckedChange={(checked) => updateSettings({ focusDimming: Boolean(checked) })}
              aria-label="Focus dimming"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("info-bar")}
          description="Show the tooltip, shortcut, or thread summary of whatever you point at in a bar along the bottom of the window."
          resetAction={
            settings.infoBarEnabled !== DEFAULT_UNIFIED_SETTINGS.infoBarEnabled ? (
              <SettingResetButton
                label="info bar"
                onClick={() =>
                  updateSettings({ infoBarEnabled: DEFAULT_UNIFIED_SETTINGS.infoBarEnabled })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.infoBarEnabled}
              onCheckedChange={(checked) => updateSettings({ infoBarEnabled: Boolean(checked) })}
              aria-label="Show info bar"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("math-rendering")}
          description="Typeset LaTeX math, such as $x^2$ or \[x^2\], in messages and Markdown previews. The composer keeps TeX source editable."
          resetAction={
            settings.mathRenderingEnabled !== DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled ? (
              <SettingResetButton
                label="math rendering"
                onClick={() =>
                  updateSettings({
                    mathRenderingEnabled: DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.mathRenderingEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ mathRenderingEnabled: Boolean(checked) })
              }
              aria-label="Render math"
            />
          }
        />
        <AdvancedSettings
          targetIds={[
            searchableSetting("panel-animations").id,
            searchableSetting("environment-identification").id,
            // Environment identification's search result lands on this section.
            "appearance-interface",
            searchableSetting("composer-context").id,
          ]}
        >
          <SettingsRow
            {...searchableSetting("panel-animations")}
            description="Set how fast panels open and close."
            control={
              <div className="grid w-full grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 sm:w-auto sm:grid-cols-[7rem_13rem] sm:gap-4">
                <PanelAnimationsPreview durationMs={settings.panelAnimationDurationMs} />
                <div className="flex w-full items-center gap-3">
                  <output
                    className="min-w-16 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                    htmlFor="panel-animation-duration"
                  >
                    {settings.panelAnimationDurationMs} ms
                  </output>
                  <input
                    aria-label="Panel animation duration"
                    className="settings-slider min-w-0 flex-1"
                    id="panel-animation-duration"
                    max={MAX_PANEL_ANIMATION_DURATION_MS}
                    min={MIN_PANEL_ANIMATION_DURATION_MS}
                    onChange={(event) => {
                      const panelAnimationDurationMs = Number(event.currentTarget.value);
                      if (
                        Number.isInteger(panelAnimationDurationMs) &&
                        panelAnimationDurationMs >= MIN_PANEL_ANIMATION_DURATION_MS &&
                        panelAnimationDurationMs <= MAX_PANEL_ANIMATION_DURATION_MS
                      ) {
                        updateSettings({ panelAnimationDurationMs });
                      }
                    }}
                    step={25}
                    style={panelAnimationDurationSliderStyle}
                    type="range"
                    value={settings.panelAnimationDurationMs}
                  />
                </div>
              </div>
            }
            resetAction={
              settings.panelAnimationDurationMs !==
              DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs ? (
                <SettingResetButton
                  label="panel animations"
                  onClick={() =>
                    updateSettings({
                      panelAnimationDurationMs: DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs,
                    })
                  }
                />
              ) : null
            }
          />
          {showEnvironmentIdentification ? (
            <SettingsRow
              {...searchableSetting("environment-identification")}
              description="Choose how Dev and Nightly environments are identified."
              resetAction={
                settings.environmentIdentificationMode !==
                DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE ? (
                  <SettingResetButton
                    label="environment identification"
                    onClick={() =>
                      updateSettings({
                        environmentIdentificationMode: DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE,
                      })
                    }
                  />
                ) : null
              }
              control={
                <Select
                  value={settings.environmentIdentificationMode}
                  onValueChange={(value) => {
                    if (value === "artwork" || value === "pill" || value === "none") {
                      updateSettings({ environmentIdentificationMode: value });
                    }
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full sm:w-40"
                    aria-label="Environment identification"
                  >
                    <SelectValue>
                      {ENVIRONMENT_IDENTIFICATION_LABELS[settings.environmentIdentificationMode]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    {Object.entries(ENVIRONMENT_IDENTIFICATION_LABELS).map(([value, label]) => (
                      <SelectItem hideIndicator key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              }
            />
          ) : null}
          <SettingsRow
            {...searchableSetting("composer-context")}
            description="Keep branch and worktree controls below the composer after a thread starts."
            resetAction={
              settings.persistComposerContextStrip !==
              DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip ? (
                <SettingResetButton
                  label="composer context"
                  onClick={() =>
                    updateSettings({
                      persistComposerContextStrip:
                        DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.persistComposerContextStrip}
                onCheckedChange={(checked) =>
                  updateSettings({ persistComposerContextStrip: Boolean(checked) })
                }
                aria-label="Keep composer context visible in active threads"
              />
            }
          />
        </AdvancedSettings>
      </SettingsSection>

      <SettingsSection id="appearance-reading" title="Reading">
        {readingPreview.popover}
        <SettingsRow
          {...searchableSetting("reading-spacing")}
          description="Space between lines in agent messages."
          resetAction={
            settings.messageLineHeight !== DEFAULT_UNIFIED_SETTINGS.messageLineHeight ? (
              <SettingResetButton
                label="line height"
                onClick={() =>
                  updateSettings({ messageLineHeight: DEFAULT_UNIFIED_SETTINGS.messageLineHeight })
                }
              />
            ) : null
          }
          control={
            <RangeControl
              id="message-line-height"
              label="Line height"
              min={MIN_MESSAGE_LINE_HEIGHT}
              max={MAX_MESSAGE_LINE_HEIGHT}
              value={settings.messageLineHeight}
              format={(value) => (value / 100).toFixed(2)}
              onChange={(messageLineHeight) => updateSettings({ messageLineHeight })}
              onAdjust={(anchor) => readingPreview.show("Line height", anchor)}
              onRelease={readingPreview.release}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("paragraph-spacing")}
          description="Space between paragraphs, lists, and quotes in agent messages."
          resetAction={
            settings.messageParagraphSpacing !==
            DEFAULT_UNIFIED_SETTINGS.messageParagraphSpacing ? (
              <SettingResetButton
                label="paragraph spacing"
                onClick={() =>
                  updateSettings({
                    messageParagraphSpacing: DEFAULT_UNIFIED_SETTINGS.messageParagraphSpacing,
                  })
                }
              />
            ) : null
          }
          control={
            <RangeControl
              id="message-paragraph-spacing"
              label="Paragraph spacing"
              min={MIN_MESSAGE_PARAGRAPH_SPACING}
              max={MAX_MESSAGE_PARAGRAPH_SPACING}
              value={settings.messageParagraphSpacing}
              format={(value) => `${(value / 100).toFixed(2)} rem`}
              onChange={(messageParagraphSpacing) => updateSettings({ messageParagraphSpacing })}
              onAdjust={(anchor) => readingPreview.show("Paragraph spacing", anchor)}
              onRelease={readingPreview.release}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("heavier-dark-text")}
          description="In dark mode, make body text slightly heavier so light-on-dark text doesn't look thin."
          resetAction={
            settings.heavierDarkText !== DEFAULT_UNIFIED_SETTINGS.heavierDarkText ? (
              <SettingResetButton
                label="heavier dark text"
                onClick={() =>
                  updateSettings({ heavierDarkText: DEFAULT_UNIFIED_SETTINGS.heavierDarkText })
                }
              />
            ) : null
          }
          control={
            <div
              className="flex"
              onClick={(event) => {
                readingPreview.show("Heavier text in dark mode", event.currentTarget);
                readingPreview.release();
              }}
            >
              <Switch
                checked={settings.heavierDarkText}
                onCheckedChange={(checked) => updateSettings({ heavierDarkText: Boolean(checked) })}
                aria-label="Heavier text in dark mode"
              />
            </div>
          }
        />
      </SettingsSection>

      <TypographySection />
    </SettingsPageContainer>
  );
}
