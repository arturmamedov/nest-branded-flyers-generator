import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiBundle } from '../../src/shared/schema.js';

/* The AI's composition root (server/ai/composition.ts). Off builds nothing and reads nothing: a site with no key
   starts and serves whatever state schema/ai.json is in, as the PHP backend does (Bootstrap::aiService). The bundle
   loader is replaced by one that throws, so a read is a failure here. */

vi.mock('../../server/ai/bundle.js', () => ({
  loadBundle: vi.fn(() => {
    throw new Error('schema/ai.json was read');
  }),
}));

const { loadBundle } = await import('../../server/ai/bundle.js');
const { createAiService } = await import('../../server/ai/composition.js');
const { loadAiSettings } = await import('../../server/config.js');
const { AiService } = await import('../../server/ai/service.js');

const deps = {
  hostels: { list: async () => [], bySlug: async () => null },
  usage: { record: async () => {}, countOk: async () => 0 },
  clock: { now: () => '2026-10-05T10:00:00.000Z' },
};
const bundle = { prompts: { flyer: '', share: '' }, examples: [], schemas: {} } as unknown as AiBundle;

describe('the AI’s composition', () => {
  // In braces: a function handed back from beforeEach is run as its cleanup, and mockClear() hands back the mock.
  beforeEach(() => {
    vi.mocked(loadBundle).mockClear();
  });

  it.each([
    ['no provider is named', {}],
    ['a real provider has no key', { AI_PROVIDER: 'openai' }],
    ['it is switched off', { AI_PROVIDER: 'fake', AI_FEATURES: 'flyer,share', AI_ENABLED: '0' }],
    // None until named (the owner's answer, 2026-10-05): a provider alone runs nothing.
    ['no feature is named', { AI_PROVIDER: 'fake' }],
  ])('builds no service and reads no bundle when %s', (_why, env) => {
    expect(createAiService(loadAiSettings(env), deps)).toBeUndefined();
    expect(loadBundle).not.toHaveBeenCalled();
  });

  it('builds the service from the bundle it is handed', () => {
    expect(createAiService(loadAiSettings({ AI_PROVIDER: 'fake', AI_FEATURES: 'share' }), { ...deps, bundle })).toBeInstanceOf(AiService);
    expect(loadBundle).not.toHaveBeenCalled();
  });

  it('reads the bundle itself when it is on and handed none', () => {
    expect(() => createAiService(loadAiSettings({ AI_PROVIDER: 'fake', AI_FEATURES: 'share' }), deps)).toThrow('schema/ai.json was read');
  });
});
