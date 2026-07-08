'use client';

import Image from 'next/image';
import { useState } from 'react';

interface Advisor {
  id: string;
  name: string;
  position: string;
  image: string;
  bio: string;
}

const ADVISORS: Advisor[] = [
  {
    id: 'mourrain',
    name: 'Philippe Mourrain',
    position: 'Professor of Sleep Psychiatry, Stanford University',
    image: '/advisors/philippe-mourrain.jpg',
    bio: 'Philippe Mourrain is a Stanford professor whose research focuses on the biological mechanisms of sleep, using genetics, neurobiology, and brain imaging to study how sleep affects brain function and development.',
  },
  {
    id: 'zeitzer',
    name: 'Jamie Marc Zeitzer',
    position: 'Professor of Sleep Medicine, Stanford University',
    image: '/advisors/jamie-zeitzer.jpg',
    bio: 'Jamie Marc Zeitzer is a Stanford sleep and circadian rhythm professor whose work explores sleep timing, light exposure, wearable sleep tracking, and technology-driven approaches to improving sleep health.',
  },
];

function AdvisorCard({ advisor }: { advisor: Advisor }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="advisor-card">
      <div
        className={`advisor-photo-flip${isFlipped ? ' is-flipped' : ''}`}
        onClick={() => setIsFlipped((flipped) => !flipped)}
        role="button"
        tabIndex={0}
        aria-pressed={isFlipped}
        aria-label={`${advisor.name} photo. Click to ${isFlipped ? 'show photo' : 'read bio'}.`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsFlipped((flipped) => !flipped);
          }
        }}
      >
        <div className="advisor-photo-flip-inner">
          <div className="advisor-photo-face advisor-photo-front">
            <Image
              src={advisor.image}
              alt={advisor.name}
              fill
              sizes="(max-width: 640px) 80vw, 360px"
              className="advisor-card-image"
            />
            <p className="advisor-card-hint">Click to read bio</p>
          </div>

          <div className="advisor-photo-face advisor-photo-back">
            <p className="advisor-card-bio">{advisor.bio}</p>
          </div>
        </div>
      </div>

      <h3 className="advisor-card-name">{advisor.name}</h3>
      <p className="advisor-card-position">{advisor.position}</p>
    </div>
  );
}

export default function AdvisoryBoardSection({
  headingLevel = 'h2',
}: {
  headingLevel?: 'h1' | 'h2';
}) {
  const Heading = headingLevel;

  return (
    <section className="advisory-section" id="advisory-board" aria-label="Scientific Advisory Board">
      <div className="advisory-glow" aria-hidden="true" />

      <header className="advisory-header">
        <Heading className="advisory-title">Scientific Advisory Board</Heading>
        <p className="advisory-subtitle">
          NebuLab is guided by leading Stanford researchers in sleep science and circadian biology.
        </p>
      </header>

      <div className="advisory-grid">
        {ADVISORS.map((advisor) => (
          <AdvisorCard key={advisor.id} advisor={advisor} />
        ))}
      </div>
    </section>
  );
}
