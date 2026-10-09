import fs from "node:fs";
import path from "node:path";

type StoreFile = {
  sent: Record<string, number>;
};

export class DeliveryStore {
  private readonly inflight = new Set<string>();

  constructor(private readonly filePath: string) {}

  /** Returns false when this key was already sent or is in flight. */
  claim(key: string): boolean {
    const sent = this.read().sent;
    if (sent[key] || this.inflight.has(key)) return false;
    this.inflight.add(key);
    return true;
  }

  commit(key: string): void {
    const data = this.read();
    data.sent[key] = Date.now();
    this.write(data);
    this.inflight.delete(key);
  }

  abort(key: string): void {
    this.inflight.delete(key);
  }

  private read(): StoreFile {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoreFile;
      if (!parsed.sent || typeof parsed.sent !== "object") return { sent: {} };
      return parsed;
    } catch {
      return { sent: {} };
    }
  }

  private write(data: StoreFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data), "utf8");
  }
}

export function deliveryKey(eventType: string, eventId: string | undefined, userId: string): string {
  return eventId ? `${eventType}:${eventId}:${userId}` : `${eventType}:${userId}`;
}
