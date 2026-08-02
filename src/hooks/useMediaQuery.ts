import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    // resize is a fallback: some embedded/emulated viewports resize the
    // window without ever firing MediaQueryList change events
    mql.addEventListener('change', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      mql.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, [query]);

  return matches;
}
