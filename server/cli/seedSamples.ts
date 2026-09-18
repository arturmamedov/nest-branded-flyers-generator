import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';
import { createRepositories } from '../composition.js';
import { loadConfig } from '../config.js';
import { FIXTURE_PHOTOS_DIR, SEED_FILE, dataPaths } from '../paths.js';
import { processPhoto } from '../services/photos.js';
import { applySeedFile } from '../storage/seed.js';

/* Dev / fixture data: the six design records, including the stress test.
   Idempotent by title. The sample photos are placeholders, not licensed. */
const config = loadConfig();
const data = dataPaths(config.dataDir);
const repos = createRepositories(config, data);
await applySeedFile(repos, SEED_FILE);

const present = new Set((await repos.flyers.list({})).map((f) => f.title));
let added = 0;
for (const s of SAMPLE_FLYERS) {
  if (present.has(s.title)) continue;
  let photoId: number | null = null;
  if (s.photo) {
    const stored = await processPhoto(readFileSync(join(FIXTURE_PHOTOS_DIR, s.photo)), data.uploads);
    photoId = (await repos.photos.insert(stored)).id;
  }
  await repos.flyers.create({ title: s.title, hostel: s.hostel, template: 'activity', data: s.data, photoId });
  added++;
}
console.log(`Sample flyers: ${added} added, ${SAMPLE_FLYERS.length - added} already present.`);
await repos.close();
