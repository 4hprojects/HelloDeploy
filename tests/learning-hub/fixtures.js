import { stringify } from 'yaml';

const DEFAULT_FRONT_MATTER = {
  id: 'sample-1',
  slug: 'sample-article',
  title: 'A sample deployment article',
  description:
    'A fixture article used by the Learning Hub tests to check parsing, validation and rendering.',
  category: 'deployment-guides',
  tags: ['nodejs', 'deployment'],
  authorId: 'henson-sagorsor',
  status: 'published',
  publishedAt: '2026-10-10',
  difficulty: 'beginner',
  commentsEnabled: false,
};

const DEFAULT_BODY = '## Overview\n\nThis is a sample body with a few words.\n';

export function articleFile(overrides = {}, file = 'sample.md', body = DEFAULT_BODY) {
  const data = { ...DEFAULT_FRONT_MATTER, ...overrides };
  return { file, raw: `---\n${stringify(data)}---\n${body}` };
}
