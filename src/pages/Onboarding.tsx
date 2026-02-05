import { useState } from 'react';
import { Target, Moon, Dumbbell, ChevronRight, ChevronLeft, Minus, Plus, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/useProteinData';
import { cn } from '@/lib/utils';

type Step = 'welcome' | 'protein' | 'sleep' | 'training' | 'complete';

const STEPS: Step[] = ['welcome', 'protein', 'sleep', 'training', 'complete'];

const SLEEP_OPTIONS = [
  { label: '6h', minutes: 360 },
  { label: '7h', minutes: 420 },
  { label: '8h', minutes: 480 },
  { label: '9h', minutes: 540 },
];

const PROTEIN_PRESETS = [100, 150, 180, 200];

export function Onboarding() {
  const { updateSettings } = useSettings();
  const [step, setStep] = useState<Step>('welcome');
  const [proteinGoal, setProteinGoal] = useState(150);
  const [sleepEnabled, setSleepEnabled] = useState(false);
  const [sleepGoalMinutes, setSleepGoalMinutes] = useState(480);
  const [trainingEnabled, setTrainingEnabled] = useState(false);
  const [trainingGoalPerWeek, setTrainingGoalPerWeek] = useState(3);
  const [saving, setSaving] = useState(false);

  const currentIndex = STEPS.indexOf(step);

  function next() {
    if (currentIndex < STEPS.length - 1) {
      setStep(STEPS[currentIndex + 1]);
    }
  }

  function back() {
    if (currentIndex > 0) {
      setStep(STEPS[currentIndex - 1]);
    }
  }

  async function completeOnboarding() {
    setSaving(true);
    await updateSettings({
      defaultGoal: proteinGoal,
      sleepTrackingEnabled: sleepEnabled,
      sleepGoalMinutes: sleepEnabled ? sleepGoalMinutes : undefined,
      trainingTrackingEnabled: trainingEnabled,
      trainingGoalPerWeek: trainingEnabled ? trainingGoalPerWeek : undefined,
      onboardingCompleted: true,
    });
    window.location.href = '/';
  }

  async function skip() {
    setSaving(true);
    await updateSettings({ onboardingCompleted: true });
    window.location.href = '/';
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      {/* Progress dots */}
      <div className="flex gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={cn(
              'h-2 rounded-full transition-all duration-300',
              i === currentIndex ? 'w-6 bg-primary' : 'w-2 bg-muted',
              i < currentIndex && 'bg-primary/40'
            )}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="w-full max-w-sm">
        {step === 'welcome' && (
          <WelcomeStep onNext={next} onSkip={skip} saving={saving} />
        )}
        {step === 'protein' && (
          <ProteinStep
            goal={proteinGoal}
            setGoal={setProteinGoal}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 'sleep' && (
          <SleepStep
            enabled={sleepEnabled}
            setEnabled={setSleepEnabled}
            goalMinutes={sleepGoalMinutes}
            setGoalMinutes={setSleepGoalMinutes}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 'training' && (
          <TrainingStep
            enabled={trainingEnabled}
            setEnabled={setTrainingEnabled}
            goalPerWeek={trainingGoalPerWeek}
            setGoalPerWeek={setTrainingGoalPerWeek}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 'complete' && (
          <CompleteStep
            proteinGoal={proteinGoal}
            sleepEnabled={sleepEnabled}
            sleepGoalMinutes={sleepGoalMinutes}
            trainingEnabled={trainingEnabled}
            trainingGoalPerWeek={trainingGoalPerWeek}
            onComplete={completeOnboarding}
            onBack={back}
            saving={saving}
          />
        )}
      </div>
    </div>
  );
}

// --- Step Components ---

function WelcomeStep({ onNext, onSkip, saving }: { onNext: () => void; onSkip: () => void; saving: boolean }) {
  const pillars = [
    { icon: Target, color: 'text-primary', bg: 'bg-primary/10', title: 'Protein', desc: 'Track daily protein intake towards your goal' },
    { icon: Moon, color: 'text-purple-500', bg: 'bg-purple-500/10', title: 'Sleep', desc: 'Monitor sleep duration and quality' },
    { icon: Dumbbell, color: 'text-emerald-500', bg: 'bg-emerald-500/10', title: 'Training', desc: 'Log workouts and track consistency' },
  ];

  return (
    <div className="text-center space-y-6">
      <div>
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Welcome to Protee</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Set up your goals in under a minute
        </p>
      </div>

      <div className="space-y-3">
        {pillars.map(({ icon: Icon, color, bg, title, desc }) => (
          <div key={title} className="bg-card rounded-2xl shadow-sm p-4 flex items-center gap-4 text-left">
            <div className={cn('rounded-xl p-2.5', bg)}>
              <Icon className={cn('h-5 w-5', color)} />
            </div>
            <div>
              <div className="font-medium text-sm">{title}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 pt-2">
        <Button
          onClick={onNext}
          className="w-full h-12 text-base font-semibold btn-press"
        >
          Get Started
          <ChevronRight className="h-5 w-5 ml-1" />
        </Button>
        <button
          onClick={onSkip}
          disabled={saving}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip, use defaults
        </button>
      </div>
    </div>
  );
}

function ProteinStep({
  goal,
  setGoal,
  onNext,
  onBack,
}: {
  goal: number;
  setGoal: (g: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <StepHeader
        icon={Target}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        title="Daily Protein Goal"
        subtitle="How much protein do you want to hit each day?"
      />

      <div className="bg-card rounded-2xl shadow-sm p-6 space-y-5">
        {/* +/- controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setGoal(Math.max(50, goal - 10))}
            className="h-10 w-10 rounded-full bg-muted flex items-center justify-center btn-press hover:bg-muted/80 transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="text-center">
            <span className="text-4xl font-bold tabular-nums">{goal}</span>
            <span className="text-lg text-muted-foreground ml-1">g</span>
          </div>
          <button
            onClick={() => setGoal(Math.min(400, goal + 10))}
            className="h-10 w-10 rounded-full bg-muted flex items-center justify-center btn-press hover:bg-muted/80 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Presets */}
        <div className="flex gap-2 justify-center">
          {PROTEIN_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => setGoal(preset)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all btn-press',
                goal === preset
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted hover:bg-muted/80'
              )}
            >
              {preset}g
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Tip: Aim for 1.6–2.2g per kg of body weight
        </p>
      </div>

      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}

function SleepStep({
  enabled,
  setEnabled,
  goalMinutes,
  setGoalMinutes,
  onNext,
  onBack,
}: {
  enabled: boolean;
  setEnabled: (e: boolean) => void;
  goalMinutes: number;
  setGoalMinutes: (m: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <StepHeader
        icon={Moon}
        iconColor="text-purple-500"
        iconBg="bg-purple-500/10"
        title="Sleep Tracking"
        subtitle="Track your sleep to optimize recovery"
      />

      <div className="bg-card rounded-2xl shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">Enable sleep tracking</span>
          <ToggleButton enabled={enabled} onChange={() => setEnabled(!enabled)} />
        </div>

        {enabled && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">Nightly goal</div>
            <div className="flex gap-2">
              {SLEEP_OPTIONS.map((opt) => (
                <button
                  key={opt.minutes}
                  onClick={() => setGoalMinutes(opt.minutes)}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-sm font-medium transition-all btn-press',
                    goalMinutes === opt.minutes
                      ? 'bg-purple-500 text-white shadow-sm'
                      : 'bg-muted hover:bg-muted/80'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}

function TrainingStep({
  enabled,
  setEnabled,
  goalPerWeek,
  setGoalPerWeek,
  onNext,
  onBack,
}: {
  enabled: boolean;
  setEnabled: (e: boolean) => void;
  goalPerWeek: number;
  setGoalPerWeek: (g: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <StepHeader
        icon={Dumbbell}
        iconColor="text-emerald-500"
        iconBg="bg-emerald-500/10"
        title="Training Tracking"
        subtitle="Stay consistent with your workouts"
      />

      <div className="bg-card rounded-2xl shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">Enable training tracking</span>
          <ToggleButton enabled={enabled} onChange={() => setEnabled(!enabled)} />
        </div>

        {enabled && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">Sessions per week</div>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setGoalPerWeek(Math.max(2, goalPerWeek - 1))}
                className="h-10 w-10 rounded-full bg-muted flex items-center justify-center btn-press hover:bg-muted/80 transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="text-center min-w-[3rem]">
                <span className="text-3xl font-bold tabular-nums">{goalPerWeek}</span>
                <span className="text-sm text-muted-foreground ml-1">×</span>
              </div>
              <button
                onClick={() => setGoalPerWeek(Math.min(6, goalPerWeek + 1))}
                className="h-10 w-10 rounded-full bg-muted flex items-center justify-center btn-press hover:bg-muted/80 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}

function CompleteStep({
  proteinGoal,
  sleepEnabled,
  sleepGoalMinutes,
  trainingEnabled,
  trainingGoalPerWeek,
  onComplete,
  onBack,
  saving,
}: {
  proteinGoal: number;
  sleepEnabled: boolean;
  sleepGoalMinutes: number;
  trainingEnabled: boolean;
  trainingGoalPerWeek: number;
  onComplete: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  const summary = [
    {
      icon: Target,
      color: 'text-primary',
      bg: 'bg-primary/10',
      label: 'Protein',
      value: `${proteinGoal}g / day`,
    },
    ...(sleepEnabled
      ? [{
          icon: Moon,
          color: 'text-purple-500',
          bg: 'bg-purple-500/10',
          label: 'Sleep',
          value: `${sleepGoalMinutes / 60}h / night`,
        }]
      : []),
    ...(trainingEnabled
      ? [{
          icon: Dumbbell,
          color: 'text-emerald-500',
          bg: 'bg-emerald-500/10',
          label: 'Training',
          value: `${trainingGoalPerWeek}× / week`,
        }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-3">
          <Check className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold">You're all set!</h2>
        <p className="text-sm text-muted-foreground mt-1">Here's your setup</p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm overflow-hidden divide-y divide-border/50">
        {summary.map(({ icon: Icon, color, bg, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3">
            <div className={cn('rounded-xl p-2', bg)}>
              <Icon className={cn('h-4 w-4', color)} />
            </div>
            <div className="flex-1 text-sm font-medium">{label}</div>
            <div className="text-sm text-muted-foreground">{value}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        You can change these anytime in Settings
      </p>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={saving}
          className="flex-1 h-12 btn-press"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button
          onClick={onComplete}
          disabled={saving}
          className="flex-[2] h-12 text-base font-semibold btn-press"
        >
          {saving ? 'Saving...' : 'Start Tracking'}
        </Button>
      </div>
    </div>
  );
}

// --- Shared Components ---

function StepHeader({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="text-center">
      <div className={cn('inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-3', iconBg)}>
        <Icon className={cn('h-7 w-7', iconColor)} />
      </div>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

function ToggleButton({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out',
        enabled ? 'bg-primary' : 'bg-muted'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out mt-0.5',
          enabled ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

function NavButtons({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex gap-3">
      <Button variant="outline" onClick={onBack} className="flex-1 h-12 btn-press">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back
      </Button>
      <Button onClick={onNext} className="flex-[2] h-12 text-base font-semibold btn-press">
        Continue
        <ChevronRight className="h-5 w-5 ml-1" />
      </Button>
    </div>
  );
}
