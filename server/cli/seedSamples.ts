import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAMPLE_FLYERS } from '../../src/shared/samples.js';
import { loadConfig } from '../config.js';
import { openDb } from '../db/open.js';
import { FIXTURE_PHOTOS_DIR, SEED_FILE, dataPaths } from '../paths.js';
import { createFlyer } from '../repos/flyers.js';
import { hostelBySlug } from '../repos/hostels.js';
import { insertPhoto } from '../repos/photos.js';
import { applySeedFile } from '../seed.js';
import { processPhoto } from '../services/photos.js';

/* Dev / fixture data: the six design records, including the stress test.
   Idempotent by title. The sample photos are placeholders, not licensed. */
const data = dataPaths(loadConfig().dataDir);
const db = openDb(data.db);
applySeedFile(db, SEED_FILE);

let added = 0;
for (const s of SAMPLE_FLYERS) {
  if (db.prepare('SELECT 1 FROM flyer WHERE title = ? AND archived = 0').get(s.title)) continue;
  let photoId: number | null = null;
  if (s.photo) {
    const stored = await processPhoto(readFileSync(join(FIXTURE_PHOTOS_DIR, s.photo)), data.root);
    photoId = insertPhoto(db, stored).id;
  }
  const hostelId = s.hostel ? (hostelBySlug(db, s.hostel)?.id ?? null) : null;
  createFlyer(db, { title: s.title, hostel: s.hostel, template: 'activity', data: s.data, photoId }, hostelId);
  added++;
}
console.log(`Sample flyers: ${added} added, ${SAMPLE_FLYERS.length - added} already present.`);
db.close();
