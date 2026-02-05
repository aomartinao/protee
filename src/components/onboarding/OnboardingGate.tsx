import { useState, useEffect, type ReactNode } from 'react';
import { useSettings } from '@/hooks/useProteinData';
import { db } from '@/db';
import { Onboarding } from '@/pages/Onboarding';

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { settings, updateSettings, settingsLoaded } = useSettings();
  const [checked, setChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!settingsLoaded) return;

    // Already completed onboarding
    if (settings.onboardingCompleted) {
      setChecked(true);
      setShowOnboarding(false);
      return;
    }

    // Check if existing user (has food entries) — skip onboarding for them
    db.foodEntries.count().then((count) => {
      if (count > 0) {
        updateSettings({ onboardingCompleted: true });
        setShowOnboarding(false);
      } else {
        setShowOnboarding(true);
      }
      setChecked(true);
    });
  }, [settingsLoaded, settings.onboardingCompleted, updateSettings]);

  if (!settingsLoaded || !checked) return null;
  if (showOnboarding) return <Onboarding />;
  return <>{children}</>;
}
