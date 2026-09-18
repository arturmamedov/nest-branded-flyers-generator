import type { FlyerInput, FlyerListItem, FlyerRecord, Hostel } from '../../src/shared/schema.js';
import type { StoredDoodle, StoredFlyer, StoredPhoto } from '../../src/shared/storage.js';

/* The storage seam. Every driver (SQLite, JSON files) implements these, and
   tests/storage/repositories.contract.ts proves they are interchangeable.
   Async because the JSON driver waits on a cross-process lock. */

export interface Clock {
  /** toISOString(): UTC, milliseconds, Z. */
  now(): string;
}

export const systemClock: Clock = { now: () => new Date().toISOString() };

/** Thrown for a hostel slug or photo id that does not exist. The HTTP layer checks first, so this is a bug guard. */
export class MissingReferenceError extends Error {}

export type HostelFields = Omit<Hostel, 'id'>;
export type DoodleFields = Omit<StoredDoodle, 'id'>;

export interface HostelRepository {
  /** By sortOrder, then name (code-point order), then id. */
  list(): Promise<Hostel[]>;
  bySlug(slug: string): Promise<Hostel | null>;
  /** By slug: keeps the id, updates name, island, logoPath and sortOrder. Never deletes. */
  upsert(h: HostelFields): Promise<void>;
  /** Insert or replace, keeping the id (the copy tool). */
  put(h: Hostel): Promise<void>;
}

export interface DoodleRepository {
  /** Built-ins first, then kind, then label (code-point order), then id. */
  list(): Promise<StoredDoodle[]>;
  /** By slug: keeps the id, updates label, path and kind, never flips `builtin`. */
  upsert(d: DoodleFields): Promise<void>;
  put(d: StoredDoodle): Promise<void>;
}

export interface PhotoRepository {
  insert(p: { path: string; width: number; height: number }): Promise<StoredPhoto>;
  get(id: number): Promise<StoredPhoto | null>;
  all(): Promise<StoredPhoto[]>;
  put(p: StoredPhoto): Promise<void>;
}

export interface FlyerFilter {
  /** A hostel slug, or 'none' for chain-wide flyers. Empty means all. */
  hostel?: string;
  template?: string;
}

export interface FlyerRepository {
  /** null when missing or archived. */
  get(id: number): Promise<FlyerRecord | null>;
  /** Not archived, newest first: updatedAt then id, both descending. Hostel names are the current ones. */
  list(filter: FlyerFilter): Promise<FlyerListItem[]>;
  /** Stores the input as given (already normalised); createdAt = updatedAt = now. */
  create(input: FlyerInput): Promise<number>;
  /** false when missing or archived. Keeps createdAt. */
  update(id: number, input: FlyerInput): Promise<boolean>;
  /** Soft delete; bumps updatedAt. false when missing or already archived. */
  archive(id: number): Promise<boolean>;
  /** Every flyer, archived included, by id. */
  all(): Promise<StoredFlyer[]>;
  put(f: StoredFlyer): Promise<void>;
}

export interface Repositories {
  hostels: HostelRepository;
  doodles: DoodleRepository;
  photos: PhotoRepository;
  flyers: FlyerRepository;
  close(): Promise<void>;
}

/** What the HTTP app calls — nothing more (the copy tool and seeding use the rest). */
export interface AppRepositories {
  hostels: Pick<HostelRepository, 'list' | 'bySlug'>;
  doodles: Pick<DoodleRepository, 'list'>;
  photos: Pick<PhotoRepository, 'insert' | 'get'>;
  flyers: Pick<FlyerRepository, 'get' | 'list' | 'create' | 'update' | 'archive'>;
}

/** What seeding calls. */
export interface SeedRepositories {
  hostels: Pick<HostelRepository, 'list' | 'upsert'>;
  doodles: Pick<DoodleRepository, 'upsert'>;
}
