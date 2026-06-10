import {useEffect} from 'react';

export function useTerminalCursor(): void {
  useEffect(() => {
    if (!process.stdout.isTTY) return;
    process.stdout.write('\x1b[?25l');
    return () => {
      process.stdout.write('\x1b[?25h');
    };
  }, []);
}
