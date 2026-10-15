import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { lock, root, executable, digest, run } from './toolchain.mjs';

const report = { host: `${process.platform}-${process.arch}`, editor: 'missing', android: 'missing', rendering: 'unverified', tablet: 'unverified' };
if (report.host !== lock.host) report.editor = 'incompatible';
else {
  try {
    await access(executable);
    report.editor = 'incompatible';
    const receipt = JSON.parse(await readFile(resolve(root, 'editor-receipt.json'), 'utf8'));
    report.binarySha256 = await digest(executable);
    if (receipt.archiveSha256 === lock.engine.sha256 && receipt.binarySha256 === report.binarySha256) {
      report.version = run(executable, ['--headless', '--version']);
      if (report.version === lock.engine.version) report.editor = 'ready';
    }
  } catch (error) { report.detail = error.message; }
}
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.editor === 'ready' ? 0 : 1;
