import { decode, encode } from 'base-64';
import { Platform } from 'react-native';
import type { Device, Subscription } from 'react-native-ble-plx';
import { parseEsp32Event, type Esp32Event } from './esp32Events';

const getBleManager = () => {
  if (Platform.OS === 'web') return null;

  try {
    const bleModule = require('react-native-ble-plx') as typeof import('react-native-ble-plx');
    return bleModule.BleManager ?? null;
  } catch {
    return null;
  }
};

const BleManager = getBleManager();

export { parseEsp32Event } from './esp32Events';
export type { Esp32Event } from './esp32Events';

export const ESP32_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const ESP32_COMMAND_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
export const ESP32_EVENT_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

export type Esp32ConnectionStatus =
  | 'unavailable'
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type Esp32ConnectionSnapshot = {
  status: Esp32ConnectionStatus;
  deviceName: string | null;
  deviceId: string | null;
  message: string;
  retryAttempt: number;
};

type SnapshotListener = (snapshot: Esp32ConnectionSnapshot) => void;
type EventListener = (event: Esp32Event) => void;
type ReadLastMessageHandler = (event: Esp32Event) => void;

const initialSnapshot: Esp32ConnectionSnapshot = {
  status: Platform.OS === 'web' ? 'unavailable' : 'idle',
  deviceName: null,
  deviceId: null,
  message: Platform.OS === 'web' ? 'BLE exige um build nativo e um dispositivo compatível.' : 'Nenhum ESP32 conectado.',
  retryAttempt: 0,
};

class Esp32BleService {
  // react-native-ble-plx usa módulos nativos e não pode ser instanciado no SSR/Web.
  private readonly manager = BleManager ? new BleManager() : null;
  private snapshot = initialSnapshot;
  private device: Device | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectSubscription: Subscription | null = null;
  private eventSubscription: Subscription | null = null;
  private manualDisconnect = false;
  private listeners = new Set<SnapshotListener>();
  private eventListeners = new Set<EventListener>();
  private readLastMessageHandler: ReadLastMessageHandler | null = null;
  private pendingReadLastMessage: Esp32Event | null = null;
  private selectedConversationId = '';

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener: SnapshotListener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => { this.listeners.delete(listener); };
  }

  subscribeToEvents(listener: EventListener) {
    this.eventListeners.add(listener);
    return () => { this.eventListeners.delete(listener); };
  }

  registerReadLastMessageHandler(handler: ReadLastMessageHandler) {
    this.readLastMessageHandler = handler;
    if (this.pendingReadLastMessage) {
      const pending = this.pendingReadLastMessage;
      this.pendingReadLastMessage = null;
      handler(pending);
    }
    return () => {
      if (this.readLastMessageHandler === handler) this.readLastMessageHandler = null;
    };
  }

  dispatchReadLastMessage(event: Esp32Event) {
    if (this.readLastMessageHandler) this.readLastMessageHandler(event);
    else this.pendingReadLastMessage = event;
  }

  setSelectedConversationId(id: string) {
    this.selectedConversationId = id;
  }

  getSelectedConversationId() {
    return this.selectedConversationId;
  }

  private update(next: Partial<Esp32ConnectionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  private emit(event: Esp32Event) {
    this.eventListeners.forEach((listener) => listener(event));
  }

  async scanAndConnect(timeoutMs = 10_000) {
    if (Platform.OS === 'web') {
      this.update({ status: 'unavailable', message: 'A conexão BLE só funciona em um development build Android/iOS.' });
      return false;
    }
    const manager = this.manager;
    if (!manager) return false;
    if (this.snapshot.status === 'scanning' || this.snapshot.status === 'connecting' || this.snapshot.status === 'connected') return false;
    this.clearTimers();
    this.manualDisconnect = false;
    this.update({ status: 'scanning', message: 'Procurando um ESP32 próximo…', retryAttempt: 0 });

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (connected: boolean) => {
        if (settled) return;
        settled = true;
        manager.stopDeviceScan();
        if (this.scanTimer) clearTimeout(this.scanTimer);
        this.scanTimer = null;
        resolve(connected);
      };
      this.scanTimer = setTimeout(() => {
        this.update({ status: 'disconnected', message: 'Nenhum ESP32 compatível foi encontrado.' });
        finish(false);
      }, timeoutMs);
      manager.startDeviceScan([ESP32_SERVICE_UUID], null, async (error, device) => {
        if (error) {
          this.update({ status: 'error', message: `Falha ao procurar o ESP32: ${error.message}` });
          finish(false);
          return;
        }
        if (!device) return;
        this.update({ status: 'connecting', deviceName: device.name || device.localName || 'ESP32', deviceId: device.id, message: 'ESP32 encontrado. Conectando…' });
        const connected = await this.connect(device);
        finish(connected);
      });
    });
  }

  private async connect(device: Device) {
    const manager = this.manager;
    if (!manager) return false;
    try {
      manager.stopDeviceScan();
      this.device = await device.connect({ autoConnect: false, timeout: 8_000 });
      await this.device.discoverAllServicesAndCharacteristics();
      this.disconnectSubscription?.remove();
      this.eventSubscription?.remove();
      this.disconnectSubscription = manager.onDeviceDisconnected(this.device.id, (error) => {
        this.eventSubscription?.remove();
        this.eventSubscription = null;
        if (!this.manualDisconnect) this.scheduleReconnect(error?.message);
      });
      this.eventSubscription = this.device.monitorCharacteristicForService(
        ESP32_SERVICE_UUID,
        ESP32_EVENT_CHARACTERISTIC_UUID,
        (error, characteristic) => {
          if (error) {
            this.update({ status: 'error', message: `Falha ao receber comando do ESP32: ${error.message}` });
            return;
          }
          if (!characteristic?.value) return;
          try {
            const event = parseEsp32Event(JSON.parse(decode(characteristic.value)) as unknown);
            if (!event) throw new Error('invalid event');
            this.emit(event);
          } catch {
            this.update({ status: 'error', message: 'O ESP32 enviou um comando em formato inválido.' });
          }
        },
      );
      this.update({ status: 'connected', deviceName: this.device.name || this.device.localName || 'ESP32', deviceId: this.device.id, message: 'ESP32 conectado. Aguardando o botão físico.', retryAttempt: 0 });
      return true;
    } catch (error) {
      this.device = null;
      this.update({ status: 'error', message: `Não foi possível conectar ao ESP32: ${error instanceof Error ? error.message : 'erro desconhecido'}` });
      return false;
    }
  }

  private scheduleReconnect(reason?: string) {
    if (this.reconnectTimer || this.manualDisconnect) return;
    const nextAttempt = this.snapshot.retryAttempt + 1;
    if (nextAttempt > 5) {
      this.update({ status: 'disconnected', message: 'ESP32 desconectado. Limite de tentativas de reconexão atingido.', retryAttempt: nextAttempt - 1 });
      return;
    }
    this.update({ status: 'reconnecting', message: reason ? `ESP32 desconectado: ${reason}. Tentando reconectar…` : 'ESP32 desconectado. Tentando reconectar…', retryAttempt: nextAttempt });
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.device && await this.connect(this.device)) return;
      this.scheduleReconnect();
    }, Math.min(nextAttempt * 1_500, 7_500));
  }

  async sendCommand(action: string, payload: Record<string, unknown> = {}) {
    if (!this.device || this.snapshot.status !== 'connected') throw new Error('ESP32 não está conectado.');
    const command = JSON.stringify({ type: 'command', action, ...payload });
    await this.device.writeCharacteristicWithResponseForService(
      ESP32_SERVICE_UUID,
      ESP32_COMMAND_CHARACTERISTIC_UUID,
      encode(command),
    );
  }

  simulateButtonPress() {
    const event: Esp32Event = {
      type: 'button_press',
      action: 'read_last_message',
      message: 'Botão assistivo simulado acionado',
      simulated: true,
      timestamp: new Date().toISOString(),
    };
    this.emit(event);
    return event;
  }

  async disconnect() {
    this.manualDisconnect = true;
    this.clearTimers();
    this.eventSubscription?.remove();
    this.disconnectSubscription?.remove();
    this.eventSubscription = null;
    this.disconnectSubscription = null;
    if (this.device) await this.manager?.cancelDeviceConnection(this.device.id).catch(() => undefined);
    this.device = null;
    this.update({ status: 'disconnected', deviceName: null, deviceId: null, message: 'ESP32 desconectado.', retryAttempt: 0 });
  }

  private clearTimers() {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.scanTimer = null;
    this.reconnectTimer = null;
  }

  async destroy() {
    await this.disconnect();
    this.manager?.destroy();
  }
}

export const esp32Ble = new Esp32BleService();
