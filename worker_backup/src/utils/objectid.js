/**
 * Minimal ObjectId replacement.
 *
 * The application previously used MongoDB ObjectIds. Documents now live in
 * Supabase (Postgres) where `_id` is a plain 24-hex text primary key, so this
 * shim simply wraps a string value. It keeps the constructor + toString()
 * surface used by the route handlers so they no longer need the `mongodb`
 * package.
 */
export class ObjectId {
  _bsontype = 'ObjectId';

  constructor(value) {
    if (value === undefined || value === null) {
      this.value = newObjectIdHex();
    } else {
      this.value = String(value);
    }
  }

  toString() { return this.value; }
  toJSON() { return this.value; }
  valueOf() { return this.value; }

  equals(other) {
    if (other instanceof ObjectId) return other.value === this.value;
    return String(other) === this.value;
  }

  static isValid(value) {
    return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);
  }
}

/** Generate a 24-hex id (12 random bytes), matching the old ObjectId format. */
export function newObjectIdHex() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}