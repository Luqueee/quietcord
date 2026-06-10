import {saveToken, getConfigPath} from '../../config.js';

export function readTokenFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdout.write('paste token: ');
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      buf += chunk;
      const line = buf.trim();
      if (line) {
        saveToken(line);
        process.stdout.write('saved to ' + getConfigPath() + '\n');
        resolve(line);
      }
    });
    process.stdin.on('end', () => {
      if (!buf.trim()) {
        reject(new Error('no token provided'));
      }
    });
  });
}
