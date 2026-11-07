export type Esp32Event = {
  type: 'button_press' | 'ack' | 'error' | 'status';
  action?: string;
  requestId?: string;
  message?: string;
  [key: string]: unknown;
};

export function parseEsp32Event(value: unknown): Esp32Event | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (!['button_press', 'ack', 'error', 'status'].includes(String(event.type))) return null;
  if (event.action !== undefined && typeof event.action !== 'string') return null;
  if (event.requestId !== undefined && typeof event.requestId !== 'string') return null;
  if (event.message !== undefined && typeof event.message !== 'string') return null;
  return event as Esp32Event;
}
