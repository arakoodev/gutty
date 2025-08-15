import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const cmds = [
  'init','ingest-recipes','embed-recipes','build-index','recipe-retrieve','recipe-rerank','recipe-rag','calories','recipe-analyze',
  'health-ingest','health-embed','health-build-index','health-query','health-annotate','seg-index','seg-extract','seg-retrieve','validate','reset'
];

for (const c of cmds) {
  test(`npx gutty ${c} --help`, async () => {
    const { stdout } = await execFileAsync('npx', ['--yes','--no-install','gutty', c, '--help'], {
      cwd: path.resolve(__dirname, '..', '..'),
      env: { ...process.env }
    });
    expect(stdout).toMatch(/Usage:/);
  });
}

