import type { StoredPhoto } from '../../../src/shared/storage.js';
import type { Clock, PhotoRepository } from '../types.js';
import type { RecordFile } from './records.js';
import type { JsonStore } from './store.js';

/**
 * Photo records in photos.json ($defs.photos); the image files themselves live
 * in the uploads folder. The twin of php/src/Storage/Json/JsonPhotoRepository.php,
 * plus the all()/put() the copy tool needs.
 */
export class JsonPhotoRepository implements PhotoRepository {
  constructor(
    private readonly file: RecordFile<StoredPhoto>,
    private readonly store: JsonStore,
    private readonly clock: Clock,
  ) {}

  async insert(p: { path: string; width: number; height: number }): Promise<StoredPhoto> {
    return this.store.run(async () => {
      const photos = await this.records();
      const photo = toRecord({ id: await this.file.newId(photos), ...p, createdAt: this.clock.now() });
      await this.file.write([...photos, photo]);
      return photo;
    });
  }

  async get(id: number): Promise<StoredPhoto | null> {
    return this.store.run(async () => (await this.records()).find((p) => p.id === id) ?? null);
  }

  async all(): Promise<StoredPhoto[]> {
    const photos = await this.store.run(() => this.records());
    return photos.sort((a, b) => a.id - b.id);
  }

  async put(photo: StoredPhoto): Promise<void> {
    await this.store.run(async () => {
      const photos = await this.records();
      const record = toRecord(photo);
      await this.file.write(photos.some((p) => p.id === record.id) ? photos.map((p) => (p.id === record.id ? record : p)) : [...photos, record]);
      // meta.json keeps saying which ids are taken, so the next insert cannot reuse one.
      await this.store.raise('photo', record.id);
    });
  }

  private async records(): Promise<StoredPhoto[]> {
    return (await this.file.read()).map(toRecord);
  }
}

/** The stored shape, in the schema's key order. */
const toRecord = (photo: StoredPhoto): StoredPhoto => ({
  id: photo.id,
  path: photo.path,
  width: photo.width,
  height: photo.height,
  createdAt: photo.createdAt,
});
