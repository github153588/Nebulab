'use client';

import Image from 'next/image';

export default function SiteNav() {
  const handleGetEarlyAccess = (event: React.MouseEvent) => {
    event.preventDefault();
    document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="site-nav">
      <Image src="/nebulab-logo.png" alt="NebuLab" width={1317} height={232} className="site-logo-image" priority />

      <a href="#waitlist" className="site-nav-cta" onClick={handleGetEarlyAccess}>
        Get Early Access
      </a>
    </nav>
  );
}
