import { useState } from 'react';
import {
  Eye,
  EyeOff,
  ExternalLink,
  Trash2,
  Key,
  ChevronRight,
  Target,
  Zap,
  Dumbbell,
  Sparkles
} from 'lucide-react';
import { version } from '../../package.json';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SyncStatus } from '@/components/settings/SyncStatus';
import { useSettings } from '@/hooks/useProteinData';
import { useStore } from '@/store/useStore';
import { db } from '@/db';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

// Reusable toggle component
function Toggle({
  enabled,
  onChange,
  size = 'default'
}: {
  enabled: boolean;
  onChange: () => void;
  size?: 'default' | 'small';
}) {
  const isSmall = size === 'small';
  return (
    <button
      onClick={onChange}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        enabled ? 'bg-primary' : 'bg-muted',
        isSmall ? 'h-6 w-10' : 'h-7 w-12'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
          enabled ? (isSmall ? 'translate-x-4' : 'translate-x-5') : 'translate-x-0.5',
          isSmall ? 'h-5 w-5 mt-0.5' : 'h-6 w-6 mt-0.5'
        )}
      />
    </button>
  );
}

// Settings row component
function SettingsRow({
  icon: Icon,
  iconColor = 'text-muted-foreground',
  label,
  description,
  action,
  onClick,
  className
}: {
  icon?: React.ElementType;
  iconColor?: string;
  label: string;
  description?: string;
  action?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'flex items-center justify-between w-full px-4 py-3 text-left transition-colors',
        onClick && 'hover:bg-muted/50 active:bg-muted cursor-pointer',
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {Icon && (
          <div className={cn('flex-shrink-0', iconColor)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{label}</div>
          {description && (
            <div className="text-xs text-muted-foreground truncate">{description}</div>
          )}
        </div>
      </div>
      {action && <div className="flex-shrink-0 ml-3">{action}</div>}
      {onClick && !action && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </Wrapper>
  );
}

// Settings section component
function SettingsSection({
  title,
  children
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      {title && (
        <div className="px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </span>
        </div>
      )}
      <div className="bg-card rounded-2xl overflow-hidden shadow-sm divide-y divide-border/50">
        {children}
      </div>
    </div>
  );
}

export function Settings() {
  const { settings, updateSettings } = useSettings();
  const { clearMessages } = useStore();
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKey, setApiKey] = useState(settings.claudeApiKey || '');
  const [clearDataDialogOpen, setClearDataDialogOpen] = useState(false);

  const proteinTrackingEnabled = settings.proteinTrackingEnabled !== false;

  const handleSaveApiKey = async () => {
    await updateSettings({ claudeApiKey: apiKey || undefined });
    setApiKeyDialogOpen(false);
  };

  const handleClearData = async () => {
    await db.foodEntries.clear();
    await db.dailyGoals.clear();
    await db.syncMeta.clear();
    clearMessages();
    setClearDataDialogOpen(false);
  };

  return (
    <div className="min-h-full pb-8">
      <div className="px-4 pt-4 space-y-6">
        {/* Cloud Sync - Prominent at top */}
        <SyncStatus />

        {/* Tracking Section */}
        <SettingsSection title="Tracking">
          <SettingsRow
            icon={Target}
            iconColor="text-primary"
            label="Protein"
            description={proteinTrackingEnabled ? `Goal: ${settings.defaultGoal}g per day` : 'Disabled'}
            action={
              <div className="flex items-center gap-2">
                {proteinTrackingEnabled && (
                  <Input
                    type="number"
                    value={settings.defaultGoal}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (val > 0 && val <= 500) {
                        updateSettings({ defaultGoal: val });
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    min={1}
                    max={500}
                    className="w-16 h-8 text-sm text-center"
                  />
                )}
                <Toggle
                  enabled={proteinTrackingEnabled}
                  onChange={() => updateSettings({ proteinTrackingEnabled: !proteinTrackingEnabled })}
                  size="small"
                />
              </div>
            }
          />
          <SettingsRow
            icon={Zap}
            iconColor="text-amber-500"
            label="Calories"
            description={settings.calorieTrackingEnabled ? `Goal: ${settings.calorieGoal || '–'} kcal` : 'Disabled'}
            action={
              <div className="flex items-center gap-2">
                {settings.calorieTrackingEnabled && (
                  <Input
                    type="number"
                    value={settings.calorieGoal || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (val > 0 && val <= 10000) {
                        updateSettings({ calorieGoal: val });
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    min={500}
                    max={10000}
                    placeholder="2000"
                    className="w-20 h-8 text-sm text-center"
                  />
                )}
                <Toggle
                  enabled={!!settings.calorieTrackingEnabled}
                  onChange={() => updateSettings({ calorieTrackingEnabled: !settings.calorieTrackingEnabled })}
                  size="small"
                />
              </div>
            }
          />
          <SettingsRow
            icon={Dumbbell}
            iconColor="text-purple-500"
            label="MPS Hits"
            description="≥25g protein, 2+ hours apart"
            action={
              <Toggle
                enabled={!!settings.mpsTrackingEnabled}
                onChange={() => updateSettings({ mpsTrackingEnabled: !settings.mpsTrackingEnabled })}
                size="small"
              />
            }
          />
        </SettingsSection>

        {/* AI Section */}
        <SettingsSection title="AI Analysis">
          <SettingsRow
            icon={Key}
            iconColor={settings.claudeApiKey ? 'text-green-500' : 'text-muted-foreground'}
            label="Claude API Key"
            description={settings.claudeApiKey ? 'Configured' : 'Required for food analysis'}
            onClick={() => {
              setApiKey(settings.claudeApiKey || '');
              setApiKeyDialogOpen(true);
            }}
            action={
              settings.claudeApiKey ? (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                  Active
                </span>
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )
            }
          />
        </SettingsSection>

        {/* Data Section */}
        <SettingsSection title="Data">
          <SettingsRow
            icon={Trash2}
            iconColor="text-destructive"
            label="Clear All Data"
            description="Delete all entries and reset app"
            onClick={() => setClearDataDialogOpen(true)}
          />
        </SettingsSection>

        {/* Footer */}
        <div className="pt-4 pb-2 text-center space-y-1">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Protee</span>
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">v{version}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            AI-powered protein tracking
          </p>
        </div>
      </div>

      {/* API Key Dialog */}
      <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Claude API Key
            </DialogTitle>
            <DialogDescription>
              Required for AI-powered food analysis. Your key is stored locally.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="relative">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Get your API key
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApiKeyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveApiKey}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Data Confirmation Dialog */}
      <Dialog open={clearDataDialogOpen} onOpenChange={setClearDataDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Clear All Data
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all your food entries, goals, and chat history. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setClearDataDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearData}>
              Delete Everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
