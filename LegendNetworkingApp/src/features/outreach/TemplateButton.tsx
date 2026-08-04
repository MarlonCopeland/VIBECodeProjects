// src/features/outreach/TemplateButton.tsx
// "Use a template" trigger for the outreach composers. Lists the saved
// templates for the given channel (managed in Settings → Message templates)
// and hands the chosen one back to fill the composer.

import React, { useState } from 'react';
import { Button } from '../../components/Button';
import { OptionSheet, type OptionSheetOption } from '../../components/OptionSheet';
import { useAppSettings, type MessageTemplate } from '../settings/AppSettingsContext';

interface Props {
  channel: 'text' | 'email';
  onPick: (template: MessageTemplate) => void;
}

export function TemplateButton({ channel, onPick }: Props) {
  const { templates } = useAppSettings();
  const [open, setOpen] = useState(false);
  const mine = templates.filter((t) => t.channel === channel);

  if (mine.length === 0) return null;

  const options: OptionSheetOption[] = mine.map((t) => ({
    key: t.id,
    label: t.name,
    detail: t.channel === 'email' && t.subject ? `${t.subject} — ${t.body}` : t.body,
    icon: 'document-text-outline',
    onPress: () => onPick(t),
  }));

  return (
    <>
      <OptionSheet
        visible={open}
        title="Use a template"
        options={options}
        onClose={() => setOpen(false)}
      />
      <Button title="Use a template" variant="ghost" onPress={() => setOpen(true)} />
    </>
  );
}
