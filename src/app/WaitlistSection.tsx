'use client';

import { useState, type FormEvent } from 'react';

export default function WaitlistSection() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
  };

  return (
    <section className="waitlist-section" id="waitlist" aria-label="Join the waitlist">
      <div className="waitlist-content">
        <h2 className="waitlist-title">Your best nights are ahead.</h2>
        <p className="waitlist-body">
          Join the waitlist and be among the first to experience sleep that actually works for you.
        </p>

        {submitted ? (
          <p className="waitlist-success" role="status">
            You&apos;re on the list. We&apos;ll be in touch soon.
          </p>
        ) : (
          <form className="waitlist-form" onSubmit={handleSubmit} noValidate>
            <label className="waitlist-label" htmlFor="waitlist-email">Email address</label>
            <div className="waitlist-field-row">
              <input
                id="waitlist-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="Your email address"
                className="waitlist-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button type="submit" className="waitlist-submit">Join Waitlist</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
