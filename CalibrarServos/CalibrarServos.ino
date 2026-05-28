// Calibrador de servos para el clasificador de semillas.
//
// Conexiones:
//   Servo selector  -> pin 9
//   Servo empujador -> pin 10
//
// Monitor Serial:
//   Velocidad: 9600 baudios
//   Fin de linea: Nueva linea
//
// Comandos:
//   S90       -> mueve el selector a 90 grados
//   P90       -> mueve el empujador a 90 grados
//   S+        -> suma 5 grados al selector
//   S-        -> resta 5 grados al selector
//   P+        -> suma 5 grados al empujador
//   P-        -> resta 5 grados al empujador
//   SWEEP S   -> barrido lento del selector de 0 a 180
//   SWEEP P   -> barrido lento del empujador de 0 a 180
//   TEST360 S -> prueba si el selector es de giro continuo
//   TEST360 P -> prueba si el empujador es de giro continuo
//   STOP      -> envia 90 grados a ambos servos
//   HELP      -> muestra los comandos

#include <Servo.h>

Servo servoSelector;
Servo servoEmpujador;

const int PIN_SELECTOR = 9;
const int PIN_EMPUJADOR = 10;

int anguloSelector = 90;
int anguloEmpujador = 90;
const int PASO = 5;

void setup() {
  Serial.begin(9600);

  servoSelector.attach(PIN_SELECTOR);
  servoEmpujador.attach(PIN_EMPUJADOR);

  servoSelector.write(anguloSelector);
  servoEmpujador.write(anguloEmpujador);
  delay(800);

  imprimirAyuda();
}

void loop() {
  if (Serial.available() <= 0) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();

  if (cmd.length() == 0) return;

  if (cmd == "HELP") {
    imprimirAyuda();
  } else if (cmd == "STOP") {
    detenerContinuos();
  } else if (cmd == "S+") {
    moverSelector(anguloSelector + PASO);
  } else if (cmd == "S-") {
    moverSelector(anguloSelector - PASO);
  } else if (cmd == "P+") {
    moverEmpujador(anguloEmpujador + PASO);
  } else if (cmd == "P-") {
    moverEmpujador(anguloEmpujador - PASO);
  } else if (cmd.startsWith("SWEEP")) {
    ejecutarBarrido(cmd);
  } else if (cmd.startsWith("TEST360")) {
    probarGiroContinuo(cmd);
  } else if (cmd.startsWith("S")) {
    moverSelector(cmd.substring(1).toInt());
  } else if (cmd.startsWith("P")) {
    moverEmpujador(cmd.substring(1).toInt());
  } else {
    Serial.println("Comando no reconocido. Escribe HELP.");
  }
}

void moverSelector(int angulo) {
  anguloSelector = constrain(angulo, 0, 180);
  servoSelector.write(anguloSelector);

  Serial.print("Selector = ");
  Serial.print(anguloSelector);
  Serial.println(" grados");
}

void moverEmpujador(int angulo) {
  anguloEmpujador = constrain(angulo, 0, 180);
  servoEmpujador.write(anguloEmpujador);

  Serial.print("Empujador = ");
  Serial.print(anguloEmpujador);
  Serial.println(" grados");
}

void ejecutarBarrido(String cmd) {
  if (cmd.endsWith("S")) {
    Serial.println("Barrido selector 0 -> 180 -> 0");
    barrerServo(servoSelector);
    moverSelector(90);
  } else if (cmd.endsWith("P")) {
    Serial.println("Barrido empujador 0 -> 180 -> 0");
    barrerServo(servoEmpujador);
    moverEmpujador(90);
  } else {
    Serial.println("Usa SWEEP S o SWEEP P.");
  }
}

void barrerServo(Servo &servo) {
  for (int angulo = 0; angulo <= 180; angulo += 5) {
    servo.write(angulo);
    delay(120);
  }

  delay(400);

  for (int angulo = 180; angulo >= 0; angulo -= 5) {
    servo.write(angulo);
    delay(120);
  }
}

void probarGiroContinuo(String cmd) {
  Servo *servo = NULL;
  String nombre = "";

  if (cmd.endsWith("S")) {
    servo = &servoSelector;
    nombre = "selector";
  } else if (cmd.endsWith("P")) {
    servo = &servoEmpujador;
    nombre = "empujador";
  } else {
    Serial.println("Usa TEST360 S o TEST360 P.");
    return;
  }

  Serial.print("Prueba de giro continuo en ");
  Serial.println(nombre);
  Serial.println("90 debe detenerlo si es continuo.");
  servo->write(90);
  delay(2000);

  Serial.println("0 deberia girar hacia un lado si es continuo.");
  servo->write(0);
  delay(3000);

  Serial.println("180 deberia girar hacia el otro lado si es continuo.");
  servo->write(180);
  delay(3000);

  Serial.println("STOP: vuelve a 90.");
  servo->write(90);
}

void detenerContinuos() {
  servoSelector.write(90);
  servoEmpujador.write(90);
  anguloSelector = 90;
  anguloEmpujador = 90;
  Serial.println("Ambos servos en 90.");
}

void imprimirAyuda() {
  Serial.println();
  Serial.println("=== Calibrador de servos ===");
  Serial.println("S90 / P90       -> mover a un angulo exacto");
  Serial.println("S+ / S-         -> ajustar selector en pasos de 5 grados");
  Serial.println("P+ / P-         -> ajustar empujador en pasos de 5 grados");
  Serial.println("SWEEP S / P     -> barrido 0 a 180");
  Serial.println("TEST360 S / P   -> prueba de servo continuo");
  Serial.println("STOP            -> 90 grados en ambos");
  Serial.println("HELP            -> ayuda");
  Serial.println("============================");
}
