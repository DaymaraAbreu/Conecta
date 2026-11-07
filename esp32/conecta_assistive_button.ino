#include <Arduino.h>
#include <NimBLEDevice.h>

// Mesmo contrato usado em lib/esp32Ble.ts.
static const char* SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
static const char* COMMAND_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
static const char* EVENT_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
static const int ASSISTIVE_BUTTON_PIN = 4;
static const unsigned long DEBOUNCE_MS = 250;

NimBLECharacteristic* eventCharacteristic = nullptr;
volatile bool deviceConnected = false;
bool lastButtonReading = HIGH;
bool stableButtonState = HIGH;
unsigned long lastDebounceTime = 0;

void sendJson(const String& payload) {
  if (!deviceConnected || eventCharacteristic == nullptr) return;
  eventCharacteristic->setValue(payload.c_str());
  eventCharacteristic->notify();
}

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* server, NimBLEConnInfo& connInfo) override {
    deviceConnected = true;
    sendJson(R"({"type":"status","message":"ESP32 conectado"})");
  }

  void onDisconnect(NimBLEServer* server, NimBLEConnInfo& connInfo, int reason) override {
    deviceConnected = false;
    NimBLEDevice::startAdvertising();
  }
};

class CommandCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* characteristic, NimBLEConnInfo& connInfo) override {
    const std::string value = characteristic->getValue();
    String command(value.c_str());

    // O app envia JSON. Este firmware aceita somente a ação de teste do contrato.
    if (command.indexOf("\"action\":\"ping\"") >= 0) {
      sendJson(R"({"type":"ack","action":"ping","message":"ESP32 recebeu o comando"})");
      return;
    }
    if (command.indexOf("\"action\":\"read_last_message\"") >= 0) {
      sendJson(R"({"type":"ack","action":"read_last_message","message":"Comando aceito pelo ESP32"})");
      return;
    }
    sendJson(R"({"type":"error","message":"Comando inválido"})");
  }
};

void setup() {
  Serial.begin(115200);
  pinMode(ASSISTIVE_BUTTON_PIN, INPUT_PULLUP);

  NimBLEDevice::init("Conecta ESP32");
  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  NimBLEService* service = server->createService(SERVICE_UUID);
  NimBLECharacteristic* commandCharacteristic = service->createCharacteristic(
    COMMAND_UUID,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  commandCharacteristic->setCallbacks(new CommandCallbacks());

  eventCharacteristic = service->createCharacteristic(
    EVENT_UUID,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
  );
  eventCharacteristic->setValue(R"({"type":"status","message":"ESP32 aguardando conexão"})");
  service->start();

  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setName("Conecta ESP32");
  advertising->start();
}

void loop() {
  const bool reading = digitalRead(ASSISTIVE_BUTTON_PIN);
  if (reading != lastButtonReading) {
    lastDebounceTime = millis();
    lastButtonReading = reading;
  }
  if (millis() - lastDebounceTime >= DEBOUNCE_MS && reading != stableButtonState) {
    stableButtonState = reading;
    if (stableButtonState == LOW) {
      sendJson(R"({"type":"button_press","action":"read_last_message","message":"Botão físico acionado"})");
    }
  }
  delay(10);
}
