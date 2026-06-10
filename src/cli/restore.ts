export function restoreTerminal(): void {
  if (process.stdout.writable) {
    process.stdout.write('\x1b[?25h');
    process.stdout.write('\x1b[?1049l');
  }
}
