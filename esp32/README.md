# Conecta + ESP32 — botão assistivo BLE

Esta pasta contém somente o firmware do microcontrolador. Ela é separada do aplicativo Expo/React Native.

## Hardware

- ESP32 DevKit compatível com BLE.
- Botão momentâneo normalmente aberto.
- Fios de ligação.

### Conexão física

| Componente | ESP32 |
|---|---|
| Uma perna do botão | GPIO 4 |
| Outra perna do botão | GND |

O firmware configura `GPIO 4` como `INPUT_PULLUP`. Não é necessário resistor externo para o circuito básico. O botão é considerado pressionado quando o pino fica em nível baixo.

## Firmware

Abra `conecta_assistive_button.ino` na Arduino IDE ou PlatformIO, selecione uma placa ESP32 com BLE, instale a biblioteca **NimBLE-Arduino**, compile e grave o firmware.

O dispositivo anuncia o nome `Conecta ESP32` e o serviço BLE abaixo:

- Serviço: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- App → ESP32, comando: `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
- ESP32 → app, eventos/notificações: `6e400003-b5a3-f393-e0a9-e50e24dcca9e`

## Protocolo

Todas as mensagens são JSON UTF-8 em uma única escrita/notificação.

Quando o botão físico é pressionado, o ESP32 notifica:

```json
{"type":"button_press","action":"read_last_message","message":"Botão físico acionado"}
```

O aplicativo trata o evento `button_press/read_last_message` e, quando a tela **Dispositivo Assistivo** está aberta, lê a última mensagem recebida na conversa selecionada usando Expo Speech. O evento recebido pelo BLE físico usa o mesmo handler da simulação local. Se não houver conversa ou mensagem, a interface informa a situação. Vibração e avisos de áudio seguem as preferências de acessibilidade.

O aplicativo pode enviar:

```json
{"type":"command","action":"ping"}
```

ou:

```json
{"type":"command","action":"read_last_message"}
```

O ESP32 responde com `ack`. Comandos desconhecidos geram:

```json
{"type":"error","message":"Comando inválido"}
```

## Fluxo no aplicativo

O serviço `lib/esp32Ble.ts` é responsável por:

1. Procurar dispositivos que anunciem o UUID do serviço.
2. Conectar e descobrir serviços/características.
3. Assinar notificações do botão.
4. Exibir estado de busca, conexão, erro e desconexão.
5. Tentar reconectar até cinco vezes após uma desconexão inesperada.
6. Recusar comandos quando não há conexão ou quando o payload recebido não é JSON válido.

O dashboard não mostra uma conexão simulada. Em Web, Expo Go ou sem hardware compatível, a conexão BLE física continua indisponível. Separadamente, **Configurações → Dispositivo Assistivo** oferece um simulador local que emite o mesmo evento de aplicação sem alterar o estado BLE nem indicar que há hardware conectado. O estado BLE `connected` só é emitido após o dispositivo responder ao processo nativo de conexão e descoberta.

## Validação ainda necessária

Não há um ESP32 conectado neste ambiente. Portanto, ainda não foram validados:

- Descoberta em Android e iOS reais.
- Permissões Bluetooth e localização em diferentes versões do Android.
- Conexão e reconexão após afastar o dispositivo.
- Qualidade elétrica do botão e debounce em hardware.
- Compatibilidade da versão da biblioteca NimBLE-Arduino com a placa escolhida.
- Comportamento com múltiplos ESP32 próximos.

A validação física deve ser feita com um development build nativo do Conecta, não no Preview Web ou em uma simulação.
