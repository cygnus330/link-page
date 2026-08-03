import { useState, useEffect } from 'react';

import './App.css';

import profileImage from './assets/profile.jpg';
import sunIcon from './assets/bright-sun-light-svgrepo-com.svg';
import moonIcon from './assets/dark-mode-night-moon-svgrepo-com.svg';

function App() {
  const [theme, setTheme] = useState(() => {
    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    return isSystemDark ? 'dark' : 'light';
  });

  const links = [
    { id: 0, text: '홈페이지', url: 'https://lmsoda.moe', iurl: '/links/home.svg' },
    { id: 1, text: '깃허브', url: 'https://github.com/cygnus330', iurl: '/links/github.svg' },
    { id: 2, text: '인스타그램', url: 'https://instagram.com/cygnus330_', iurl: '/links/instagram.svg' },
    { id: 3, text: '블로그', url: 'https://blog.naver.com/choigriaffe', iurl: '/links/naverblog.svg' },
  ];

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className="container">
      <button className='theme-btn' onClick={toggleTheme}>
        {theme === 'light' ? (
          <img src={moonIcon} alt="다크 모드로 변경" className="icon-dark" />
        ) : (
          <img src={sunIcon} alt="라이트 모드로 변경" className="icon-light" />
        )}
      </button>
      
      <header className="profile">
        <img 
          src={profileImage}
          alt="profile-image" 
          className="profile-img" 
        />
        <h1 className="profile-name">Junhyeok Choi</h1>
        <p className='profile-nickname'>cygnus330 / 염화은 / 자몽라임소다</p>
        <div className='profile-link-list'>

        </div>
        <h3 className="profile-bio">바이브코더 약대생</h3>
      </header>

      {/* 링크 버튼 영역 */}
      <main className="link-list">
        {links.map((link, index) => (
          <a 
            key={link.id}
            href={link.url}
            className="link-btn"
            style={{
              backgroundSize: `100% ${links.length * 100}%`,
              backgroundPosition: `0% ${links.length > 1 ? (index / (links.length - 1)) * 100 : 0}%`
            }}
          >
            <div className='link-box'>
              {
                link.iurl &&
                <img 
                  src={link.iurl}
                  alt="link-image" 
                  className="link-img" 
                />
              } 
              <span className='link-text'>{link.text}</span>
            </div>
          </a>
        ))}
      </main>

      <footer className='footer'>
        <p>© 2026 염화은. All rights reserved.</p>
        <p>Vectors and icons by <a href="https://www.svgrepo.com" target="_blank">SVG Repo</a></p>
        <div className='footer-mail-list'>
          <a href='malito:choigriaffe@naver.com'>choigriaffe@naver.com</a>
          <div>|</div>
          <a href='mailto:jhc405@skku.edu'>jhc405@skku.edu</a>
        </div>
      </footer>

    </div>
  );
}

export default App;