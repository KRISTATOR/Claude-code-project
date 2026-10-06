import { Button, Group, Modal, Stepper, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MemberRole } from '@core/model';
import { useBackend } from './backend';
import { usePreview } from './preview';
import { useTeam, useWorkspace } from './workspace';

const STEPS = {
  organizer: ['welcome', 'worlds', 'secrecy', 'drive', 'tools', 'live', 'help'],
  npc: ['welcome', 'npc', 'help'],
  player: ['welcome', 'player', 'registration', 'help'],
} as const satisfies Record<MemberRole, readonly string[]>;

/** Ask the tour to show again (from Settings). */
export const TOUR_EVENT = 'zazemi:tour';
const SEEN = 'tourSeen';

/** A short first-run tour per role; shown once per account on this computer. */
export function Tour() {
  const { t } = useTranslation();
  const { cache } = useWorkspace();
  const { role } = useTeam();
  const preview = usePreview();
  const { info } = useBackend();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (preview) return;
    if (info.showTour) {
      void cache.getMeta<boolean>(SEEN).then((seen) => {
        if (!seen) setOpen(true);
      });
    }
    const again = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_EVENT, again);
    return () => window.removeEventListener(TOUR_EVENT, again);
  }, [cache, preview, info.showTour]);

  const steps = STEPS[role];
  const close = () => {
    setOpen(false);
    void cache.setMeta(SEEN, true);
  };
  const last = step === steps.length - 1;
  return (
    <Modal opened={open} onClose={close} size="lg" title={t('app.name')} data-testid="tour">
      <Stepper active={step} onStepClick={setStep} size="xs" mb="md">
        {steps.map((key) => (
          <Stepper.Step key={key} aria-label={t(`tour.steps.${key}.title`)} />
        ))}
      </Stepper>
      <Text fw={700} size="lg" mb="xs" data-testid="tour-title">
        {t(`tour.steps.${steps[step] ?? 'welcome'}.title`)}
      </Text>
      <Text mb="lg">{t(`tour.steps.${steps[step] ?? 'welcome'}.body`)}</Text>
      <Group justify="space-between">
        <Button variant="subtle" onClick={close}>
          {t('tour.skip')}
        </Button>
        <Group>
          {step > 0 && (
            <Button variant="default" onClick={() => setStep(step - 1)}>
              {t('tour.back')}
            </Button>
          )}
          <Button onClick={() => (last ? close() : setStep(step + 1))} data-autofocus>
            {last ? t('tour.done') : t('tour.next')}
          </Button>
        </Group>
      </Group>
    </Modal>
  );
}
