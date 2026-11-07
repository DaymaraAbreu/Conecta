import { describe, expect, it } from 'vitest';
import { parseEsp32Event } from '../lib/esp32Events';

describe('parseEsp32Event', () => {
  it('accepts firmware button events and preserves extra metadata', () => {
    expect(parseEsp32Event({
      type: 'button_press',
      action: 'read_last_message',
      message: 'Botão físico acionado',
      timestamp: '2026-01-01T00:00:00.000Z',
    })).toEqual({
      type: 'button_press',
      action: 'read_last_message',
      message: 'Botão físico acionado',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
  });

  it.each([null, [], 'not an event', {}, { type: 'unknown' }, { type: 'ack', message: 42 }, { type: 'status', action: false }])(
    'rejects invalid event payloads: %j',
    (payload) => expect(parseEsp32Event(payload)).toBeNull(),
  );
});
