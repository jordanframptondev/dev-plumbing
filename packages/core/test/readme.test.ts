import { describe, expect, it } from 'vitest';
import { renderReadme } from '../src/readme';
import { agentsFields, plumbingTypeHeaderDocs, repoProfileDocs, settingsFields } from '../src/schemas';

describe('README', () => {
  const readme = renderReadme();
  it('explains every setting, agent setting and header field', () => {
    for (const f of [...settingsFields, ...agentsFields]) {
      expect(readme).toContain(`\`${f.key}\``);
      expect(readme).toContain(f.description);
    }
    for (const d of [...repoProfileDocs, ...plumbingTypeHeaderDocs]) expect(readme).toContain(`\`${d.key}\``);
  });
  it('says setup never overwrites your files', () => {
    expect(readme).toMatch(/never overwrites/);
  });
});
