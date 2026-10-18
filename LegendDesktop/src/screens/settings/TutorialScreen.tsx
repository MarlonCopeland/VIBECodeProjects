// src/screens/settings/TutorialScreen.tsx
// First-run tutorial — mirrors the phone's app/(app)/tutorial.tsx: slides
// introducing Legend's pillars, plus one desktop-only slide for the 3D
// Network map and Knows Connections. Shown automatically on first open (the
// shell in App.tsx routes here once) and re-viewable from Settings → Support.
// Covers the whole window, sidebar included. ←/→ or the Back/Next buttons
// page through; Esc skips.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BarChart3, Network, Radio, Send, UsersRound } from 'lucide-react';
import { useAppSettings } from '@legend/features/settings/AppSettingsContext';
import { TIER_SPECS } from '@legend/features/contacts/grading';
import { useRouter } from '../../app/router';
import { Button } from '../../ui/components';

interface Slide {
  key: string;
  icon: ReactNode;
  title: string;
  body: string;
  /** Extra bullet points under the body (desktop slide). */
  points?: { title: string; body: string }[];
  badge?: string;
}

const ICON = 56;

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    icon: <UsersRound size={ICON} />,
    title: 'Welcome to Legend',
    body:
      'Your network, owned by you. Import contacts from your phone or a CSV, record where you met and why you know each other — and export everything back out whenever you want. No feed, no followers, no lock-in.',
  },
  {
    key: 'grades',
    icon: <BarChart3 size={ICON} />,
    title: 'Every relationship has a grade',
    body:
      'Calls, texts, emails, and visits raise a contact’s score; time quietly erodes it. Grades map to loot-drop rarity tiers, so one glance tells you who’s golden and who’s fading.',
  },
  {
    key: 'circles',
    icon: <Radio size={ICON} />,
    title: 'Circles of Influence',
    body:
      'Group people by premise — the event, topic, or interest that connects you. Legend surfaces everyone who matches, so your “NAACP Gala” or “jazz people” circle is always one click away.',
  },
  {
    key: 'outreach',
    icon: <Send size={ICON} />,
    title: 'Reach the whole circle',
    body:
      'Blast a personalized text to each member one-by-one, email everyone at once, or work through a call list sorted stalest-first. Every touch is logged automatically and feeds the grade.',
  },
  {
    key: 'network',
    icon: <Network size={ICON} />,
    badge: 'New on desktop',
    title: 'See your whole network',
    body: 'Desktop adds two ways to see how your people connect.',
    points: [
      {
        title: '3D Network map',
        body:
          'Open Network in the sidebar: every contact is a node, premises are hubs, and Knows Connections are the links between people. Click a node to bring everything around it into focus.',
      },
      {
        title: 'Knows Connections',
        body:
          'On any contact, add the people they know. Links survive a contact being deleted and re-imported — Legend suggests the match by name and phone so you can relink in one click.',
      },
    ],
  },
];

export default function TutorialScreen() {
  const { replace } = useRouter();
  const { setHasSeenTutorial, activePalette } = useAppSettings();
  const [page, setPage] = useState(0);

  const last = page === SLIDES.length - 1;
  const slide = SLIDES[page] ?? SLIDES[0]!;

  const finish = useCallback(() => {
    setHasSeenTutorial(true);
    replace('/contacts');
  }, [setHasSeenTutorial, replace]);

  const goTo = useCallback((index: number) => setPage(Math.max(0, Math.min(SLIDES.length - 1, index))), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goTo(page + 1);
      else if (e.key === 'ArrowLeft') goTo(page - 1);
      else if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, goTo, finish]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Legend tutorial"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--s-lg) var(--s-xl) var(--s-xl)',
      }}
    >
      {/* Skip — top right */}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button title="Skip" variant="ghost" onClick={finish} />
      </div>

      <div
        key={slide.key}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          maxWidth: 620,
          width: '100%',
          margin: '0 auto',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface-alt)',
            color: 'var(--primary)',
            marginBottom: 'var(--s-xl)',
            flexShrink: 0,
          }}
        >
          {slide.icon}
        </div>

        {slide.badge ? (
          <span className="chip selected" style={{ marginBottom: 'var(--s-md)' }}>
            {slide.badge}
          </span>
        ) : null}

        <h1 style={{ fontSize: 'var(--fs-xxl)', margin: '0 0 var(--s-md)' }}>{slide.title}</h1>
        <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
          {slide.body}
        </p>

        {slide.key === 'grades' ? (
          <div className="row wrap" style={{ justifyContent: 'center', marginTop: 'var(--s-xl)' }}>
            {TIER_SPECS.map((tier) => (
              <span
                key={tier.id}
                style={{
                  padding: '6px var(--s-md)',
                  borderRadius: 'var(--r-lg)',
                  background: activePalette.colors[tier.id],
                  color: '#FFFFFF',
                  fontSize: 'var(--fs-xs)',
                  fontWeight: 600,
                }}
              >
                {tier.label}
              </span>
            ))}
          </div>
        ) : null}

        {slide.points ? (
          <div className="stack" style={{ marginTop: 'var(--s-xl)', textAlign: 'left', alignSelf: 'stretch' }}>
            {slide.points.map((pt) => (
              <div key={pt.title} className="card">
                <div style={{ fontWeight: 600, marginBottom: 'var(--s-xs)' }}>{pt.title}</div>
                <div className="small muted" style={{ lineHeight: 1.6 }}>
                  {pt.body}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Dots */}
      <div className="row" style={{ justifyContent: 'center', margin: 'var(--s-lg) 0' }}>
        {SLIDES.map((s, i) => (
          <button
            key={s.key}
            type="button"
            aria-label={`Go to slide ${i + 1}: ${s.title}`}
            aria-current={i === page}
            onClick={() => goTo(i)}
            style={{
              width: i === page ? 22 : 8,
              height: 8,
              borderRadius: 4,
              border: 0,
              padding: 0,
              cursor: 'pointer',
              background: i === page ? 'var(--primary)' : 'var(--border-strong)',
              transition: 'width 150ms ease',
            }}
          />
        ))}
      </div>

      <div className="row" style={{ justifyContent: 'center', width: '100%', maxWidth: 420, margin: '0 auto' }}>
        {page > 0 ? <Button title="Back" variant="secondary" className="grow" onClick={() => goTo(page - 1)} /> : null}
        <Button
          title={last ? 'Get started' : 'Next'}
          className="grow"
          autoFocus
          onClick={() => (last ? finish() : goTo(page + 1))}
        />
      </div>
    </div>
  );
}
