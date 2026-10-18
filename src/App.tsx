import { useEffect, useRef } from 'react';
import shell from './app/shell.html?raw';
import { startTreeDo } from './app/engine';

// Phase 1: React hosts the prototype's markup and starts the engine once it is in the page.
export default function App() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && !ref.current.firstChild) ref.current.innerHTML = shell;
    startTreeDo();
  }, []);
  return <div ref={ref} />;
}
