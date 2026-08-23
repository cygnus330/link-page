import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

import sunIcon from './assets/bright-sun-light-svgrepo-com.svg';
import moonIcon from './assets/dark-mode-night-moon-svgrepo-com.svg';

const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

function App() {
  const [theme, setTheme] = useState(() => {
    const isSystemDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    return isSystemDark ? 'dark' : 'light';
  });

  const [status, setStatus] = useState('locked');
  const [data, setData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryTrigger, setRetryTrigger] = useState(0);

  const turnstileContainerRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleVerify = useCallback(async (token) => {
    if (!token || typeof token !== 'string' || token.trim() === '') {
      setStatus('error');
      setErrorMessage('유효하지 않은 보안 토큰입니다.');
      return;
    }

    setStatus('verifying');
    setErrorMessage('');

    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const payload = await res.json();

      if (res.ok && payload.success) {
        setData(payload);
        setStatus('unlocked');
      } else {
        setStatus('error');
        setErrorMessage(
          payload.error || '보안 인증에 실패했습니다. 다시 시도해주세요.'
        );
      }
    } catch {
      setStatus('error');
      setErrorMessage(
        '서버와의 통신에 실패했습니다. 네트워크 연결을 확인해주세요.'
      );
    }
  }, []);

  const handleRetry = () => {
    setErrorMessage('');
    setStatus('locked');
    setRetryTrigger((prev) => prev + 1);
  };

  useEffect(() => {
    if (status === 'unlocked') {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
      return;
    }

    let isMounted = true;
    let pollTimer = null;

    const renderWidget = () => {
      if (!isMounted || !turnstileContainerRef.current || !window.turnstile) {
        return;
      }

      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }

      try {
        const id = window.turnstile.render(turnstileContainerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: theme === 'dark' ? 'dark' : 'light',
          callback: (token) => {
            if (isMounted) {
              handleVerify(token);
            }
          },
          'error-callback': () => {
            if (isMounted) {
              setStatus('error');
              setErrorMessage('보안 인증 중 오류가 발생했습니다.');
            }
          },
          'expired-callback': () => {
            if (isMounted) {
              setStatus('locked');
              if (widgetIdRef.current && window.turnstile) {
                try {
                  window.turnstile.reset(widgetIdRef.current);
                } catch {
                  // ignore
                }
              }
            }
          },
        });
        widgetIdRef.current = id;
      } catch (err) {
        console.warn('Turnstile render warning:', err);
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      let attempts = 0;
      pollTimer = setInterval(() => {
        attempts++;
        if (window.turnstile) {
          clearInterval(pollTimer);
          if (isMounted) renderWidget();
        } else if (attempts >= 100) {
          clearInterval(pollTimer);
        }
      }, 50);
    }

    return () => {
      isMounted = false;
      if (pollTimer) clearInterval(pollTimer);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [theme, status, handleVerify, retryTrigger]);

  return (
    <div className="container">
      {/* Floating Theme Toggle Button (Always Available) */}
      <button className="theme-btn" onClick={toggleTheme} aria-label="테마 전환">
        {theme === 'light' ? (
          <img src={moonIcon} alt="다크 모드로 변경" className="icon-dark" />
        ) : (
          <img src={sunIcon} alt="라이트 모드로 변경" className="icon-light" />
        )}
      </button>

      {/* Gateway Screen: Rendered when Locked / Verifying / Error */}
      {status !== 'unlocked' && (
        <div className="gateway-card">
          <div className="gateway-badge">
            <svg
              className="gateway-lock-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <h2 className="gateway-title">보안 인증</h2>
          <p className="gateway-desc">
            {status === 'verifying'
              ? '인증 확인 중입니다. 잠시만 기다려주세요...'
              : '콘텐츠를 보려면 아래 보안 확인을 완료해주세요.'}
          </p>

          <div className="gateway-turnstile-wrapper">
            <div
              ref={turnstileContainerRef}
              className="turnstile-container"
            />
          </div>

          {status === 'verifying' && (
            <div className="gateway-status" role="status">
              <div className="gateway-spinner" />
              <span>인증 확인 중...</span>
            </div>
          )}

          {status === 'error' && (
            <div className="gateway-error" role="alert">
              <span className="gateway-error-text">
                {errorMessage || '인증에 실패했습니다.'}
              </span>
              <button
                type="button"
                className="retry-btn"
                onClick={handleRetry}
              >
                <svg
                  className="retry-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>다시 시도</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Unlocked Link-Page: Rendered strictly when status === 'unlocked' */}
      {status === 'unlocked' && data && (
        <div className="unlocked-content">
          <header className="profile">
            <img
              src={data.profile?.avatar || data.profile?.profileImage}
              alt="profile-image"
              className="profile-img"
            />
            <h1 className="profile-name">{data.profile?.name}</h1>
            <p className="profile-nickname">{data.profile?.nickname}</p>
            <div className="profile-link-list" />
            <h3 className="profile-bio">{data.profile?.bio}</h3>
          </header>

          <main className="link-list">
            {data.links?.map((link, index) => (
              <a
                key={link.id}
                href={link.url}
                className="link-btn"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  backgroundSize: `100% ${(data.links?.length || 1) * 100}%`,
                  backgroundPosition: `0% ${
                    data.links?.length > 1
                      ? (index / (data.links.length - 1)) * 100
                      : 0
                  }%`,
                }}
              >
                <div className="link-box">
                  {link.iurl && (
                    <img
                      src={link.iurl}
                      alt="link-image"
                      className="link-img"
                    />
                  )}
                  <span className="link-text">{link.text}</span>
                </div>
              </a>
            ))}
          </main>

          <footer className="footer">
            <p>{data.footer?.copyright}</p>
            <p>
              Vectors and icons by{' '}
              <a
                href="https://www.svgrepo.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                SVG Repo
              </a>
            </p>
            <div className="footer-mail-list">
              {data.footer?.emails?.map((email, idx) => (
                <span key={email} style={{ display: 'contents' }}>
                  {idx > 0 && <div>|</div>}
                  <a href={`mailto:${email}`}>{email}</a>
                </span>
              ))}
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}

export default App;