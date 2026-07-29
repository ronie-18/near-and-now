import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Mounted once under <Router> in App.tsx — react-router doesn't reset scroll
// position on navigation like a traditional multi-page site, so without this
// every internal <Link> click (product cards, category links, footer links)
// renders the next page already scrolled to whatever pixel offset the
// previous page was at.
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollToTop;
