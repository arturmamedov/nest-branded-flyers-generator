import { loadConfig } from '../config.js';
import { openDb } from '../db/open.js';
import { SEED_FILE, dataPaths } from '../paths.js';
import { applySeedFile } from '../seed.js';

const data = dataPaths(loadConfig().dataDir);
const db = openDb(data.db);
const report = applySeedFile(db, SEED_FILE);
console.log(`Seeded ${report.hostels} hostels and ${report.doodles} built-in doodles into ${data.db}`);
if (report.orphanHostels.length) {
  console.warn(`In the database but not in seed/hostels.json (kept): ${report.orphanHostels.join(', ')}`);
}
db.close();
