import { createRepositories } from '../composition.js';
import { loadConfig } from '../config.js';
import { SEED_FILE, dataPaths } from '../paths.js';
import { applySeedFile } from '../storage/seed.js';

const config = loadConfig();
const data = dataPaths(config.dataDir);
const repos = createRepositories(config, data);
const report = await applySeedFile(repos, SEED_FILE);
console.log(`Seeded ${report.hostels} hostels and ${report.doodles} built-in doodles into ${data.root} (${config.storage})`);
if (report.orphanHostels.length) {
  console.warn(`In storage but not in seed/hostels.json (kept): ${report.orphanHostels.join(', ')}`);
}
await repos.close();
