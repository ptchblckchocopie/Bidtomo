import React, { useEffect, useRef, useState } from 'react';

const FROG_VIDEO_URL =
  'https://htcdkqplcmdbyjlvzono.supabase.co/storage/v1/object/public/bidmo-media/bidmoto/frog.mp4';

const UnauthorizedView: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [redirecting, setRedirecting] = useState(false);

  // Hide Payload's UI (nav, header) so nothing bleeds through
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      body > *, #app > *, .template-minimal, nav, .nav,
      [class*="nav"], [class*="Nav"], header, aside {
        visibility: hidden !important;
      }
      #frog-overlay, #frog-overlay * {
        visibility: visible !important;
      }
      body { overflow: hidden !important; background: #000 !important; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      setRedirecting(true);
      document.cookie = 'payload-token=; Max-Age=0; path=/';
      window.location.href = '/admin/login';
    };

    video.addEventListener('ended', handleEnded);

    // Fallback: if video fails to load or play, redirect after 6s
    const fallback = setTimeout(handleEnded, 7000);

    return () => {
      video.removeEventListener('ended', handleEnded);
      clearTimeout(fallback);
    };
  }, []);

  return (
    <div
      id="frog-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        zIndex: 2147483647,
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{
          maxWidth: '80vw',
          maxHeight: '70vh',
          borderRadius: '12px',
          boxShadow: '0 0 80px rgba(0,0,0,0.8)',
        }}
      >
        <source src={FROG_VIDEO_URL} type="video/mp4" />
      </video>
      <div
        style={{
          marginTop: '1.5rem',
          textAlign: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <h2 style={{ fontSize: '1.3rem', color: '#fff', marginBottom: '0.5rem' }}>
          Unauthorized
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
          {redirecting
            ? 'Redirecting to login...'
            : 'Only admin accounts can access this panel.'}
        </p>
      </div>
    </div>
  );
};

export default UnauthorizedView;
