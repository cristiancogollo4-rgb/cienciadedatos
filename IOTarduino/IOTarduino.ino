// Clasificador de semillas con 2 servos.
//
// MG90S en pin 9:
//   Posiciona debajo del hueco el recipiente/clase correcta.
//
// SG90 en pin 10:
//   Empuja la semilla por el hueco fijo.
//
// Distribucion del semicirculo del MG90S:
//   0   a 45  grados -> arroz
//   45  a 90  grados -> frijol
//   90  a 135 grados -> arbeja
//   135 a 180 grados -> maiz pira
//
// Este MG90S recorre fisicamente 270 grados cuando Arduino manda 0-180.
// Como el mecanismo solo necesita 180 grados fisicos, limitamos el comando
// Arduino a un rango calibrable:
//   0-180 grados del mecanismo -> COMANDO_MG90S_MIN-COMANDO_MG90S_MAX.
//
// Monitor Serial:
//   Velocidad: 9600 baudios
//   Fin de linea: Nueva linea
//
// Comandos:
//   ARROZ, FRIJOL, ARBEJA, MAIZ_PIRA -> posiciona y empuja
//   TEST                            -> prueba todas las clases
//   PUSH                            -> prueba solo el empujador
//   HOME                            -> vuelve a posicion inicial
//   M90                             -> mueve manualmente el MG90S a 90 grados
//   S90                             -> mueve manualmente el SG90 a 90 grados
//   SG90_SPEED 8                    -> ajusta velocidad del SG90 en ms por grado

#include <Servo.h>

Servo servoMG90S;
Servo servoSG90;

const int PIN_MG90S = 9;
const int PIN_SG90 = 10;

const int COMANDO_MG90S_MIN = 0;
const int COMANDO_MG90S_MAX = 135;

// Usamos el centro de cada rango para que no quede justo en el borde.
const int ANGULO_ARROZ = 0;       // arroz queda en la posicion inicial
const int ANGULO_FRIJOL = 67;     // rango 45-90
const int ANGULO_ARBEJA = 135;    // ajustado hacia mas recorrido
const int ANGULO_MAIZ_PIRA = 180; // ajustado hacia el final del recorrido

const int ANGULO_HOME = 0;

// Empujador SG90:
//   empieza en 180, empuja a 0 y vuelve a 180.
const int SG90_REPOSO = 180;
const int SG90_EMPUJE = 0;

const unsigned long TIEMPO_MG90S_MS = 900;
const unsigned long TIEMPO_EMPUJE_MS = 500;
const unsigned long TIEMPO_RETORNO_MS = 500;
const unsigned long PAUSA_ENTRE_PRUEBAS_MS = 900;
const bool LIBERAR_SERVOS_TRAS_MOVIMIENTO = false;
const int SG90_VELOCIDAD_MIN_MS = 1;
const int SG90_VELOCIDAD_MAX_MS = 40;

int sg90VelocidadMs = 8;

void setup() {
  servoMG90S.attach(PIN_MG90S);
  servoSG90.attach(PIN_SG90);
  Serial.begin(9600);

  moverHome();

  Serial.println("Clasificador listo.");
  Serial.println("Comandos: ARROZ, FRIJOL, ARBEJA, MAIZ_PIRA, TEST, PUSH, HOME, M90, S90, SG90_SPEED 8");
}

void loop() {
  if (Serial.available() <= 0) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();

  if (cmd.length() == 0) return;

  if (cmd == "ARROZ") {
    clasificarSemilla("ARROZ", ANGULO_ARROZ);
  } else if (cmd == "FRIJOL" || cmd == "FRIJOLES") {
    clasificarSemilla("FRIJOL", ANGULO_FRIJOL);
  } else if (cmd == "ARBEJA" || cmd == "ARBEJAS" || cmd == "ARVEJA" || cmd == "ARVEJAS") {
    clasificarSemilla("ARBEJA", ANGULO_ARBEJA);
  } else if (cmd == "MAIZ" || cmd == "MAIZPIRA" || cmd == "MAIZ_PIRA" || cmd == "MAIZ PIRA") {
    clasificarSemilla("MAIZ_PIRA", ANGULO_MAIZ_PIRA);
  } else if (cmd == "TEST") {
    probarTodasLasClases();
  } else if (cmd == "PUSH") {
    empujarSemilla();
  } else if (cmd == "HOME") {
    moverHome();
  } else if (cmd.startsWith("M")) {
    moverManualMG90S(cmd.substring(1).toInt());
  } else if (cmd.startsWith("SG90_SPEED")) {
    configurarVelocidadSG90(cmd.substring(10).toInt());
  } else if (cmd.startsWith("S")) {
    moverManual(servoSG90, "SG90", cmd.substring(1).toInt());
  } else {
    Serial.print("Comando no reconocido: ");
    Serial.println(cmd);
  }
}

void clasificarSemilla(const char *clase, int anguloMG90S) {
  Serial.print("Clase: ");
  Serial.print(clase);
  Serial.print(" -> MG90S a ");
  Serial.print(anguloMG90S);
  Serial.println(" grados");

  escribirMG90S(anguloMG90S);
  delay(TIEMPO_MG90S_MS);
  liberarMG90SSiCorresponde();

  empujarSemilla();

  Serial.println("Ciclo terminado.");
}

void empujarSemilla() {
  Serial.println("SG90 -> empuja");
  asegurarSG90Activo();
  moverServoLento(servoSG90, SG90_REPOSO, SG90_EMPUJE, sg90VelocidadMs);
  delay(TIEMPO_EMPUJE_MS);

  Serial.println("SG90 -> reposo");
  moverServoLento(servoSG90, SG90_EMPUJE, SG90_REPOSO, sg90VelocidadMs);
  delay(TIEMPO_RETORNO_MS);
  liberarSG90SiCorresponde();
}

void moverHome() {
  asegurarMG90SActivo();
  asegurarSG90Activo();
  escribirMG90S(ANGULO_HOME);
  servoSG90.write(SG90_REPOSO);
  delay(800);
  liberarMG90SSiCorresponde();
  liberarSG90SiCorresponde();
  Serial.println("Sistema en posicion inicial.");
}

void moverManual(Servo &servo, const char *nombre, int angulo) {
  angulo = constrain(angulo, 0, 180);
  servo.write(angulo);

  Serial.print(nombre);
  Serial.print(" -> ");
  Serial.print(angulo);
  Serial.println(" grados");
}

void moverServoLento(Servo &servo, int desde, int hasta, int pausaMs) {
  pausaMs = constrain(pausaMs, SG90_VELOCIDAD_MIN_MS, SG90_VELOCIDAD_MAX_MS);

  if (desde < hasta) {
    for (int angulo = desde; angulo <= hasta; angulo++) {
      servo.write(angulo);
      delay(pausaMs);
    }
  } else {
    for (int angulo = desde; angulo >= hasta; angulo--) {
      servo.write(angulo);
      delay(pausaMs);
    }
  }
}

void configurarVelocidadSG90(int velocidadMs) {
  sg90VelocidadMs = constrain(velocidadMs, SG90_VELOCIDAD_MIN_MS, SG90_VELOCIDAD_MAX_MS);

  Serial.print("SG90 velocidad ms: ");
  Serial.println(sg90VelocidadMs);
}

void moverManualMG90S(int anguloFisico) {
  anguloFisico = constrain(anguloFisico, 0, 180);
  escribirMG90S(anguloFisico);
  delay(TIEMPO_MG90S_MS);
  liberarMG90SSiCorresponde();

  Serial.print("MG90S -> ");
  Serial.print(anguloFisico);
  Serial.print(" grados / comando Arduino ");
  Serial.println(limitarAnguloMG90S(anguloFisico));
}

void escribirMG90S(int anguloFisico) {
  asegurarMG90SActivo();
  servoMG90S.write(limitarAnguloMG90S(anguloFisico));
}

int limitarAnguloMG90S(int anguloFisico) {
  anguloFisico = constrain(anguloFisico, 0, 180);
  return map(anguloFisico, 0, 180, COMANDO_MG90S_MIN, COMANDO_MG90S_MAX);
}

void asegurarMG90SActivo() {
  if (!servoMG90S.attached()) servoMG90S.attach(PIN_MG90S);
}

void asegurarSG90Activo() {
  if (!servoSG90.attached()) servoSG90.attach(PIN_SG90);
}

void liberarMG90SSiCorresponde() {
  if (LIBERAR_SERVOS_TRAS_MOVIMIENTO) servoMG90S.detach();
}

void liberarSG90SiCorresponde() {
  if (LIBERAR_SERVOS_TRAS_MOVIMIENTO) servoSG90.detach();
}

void probarTodasLasClases() {
  Serial.println("--- Prueba completa ---");

  clasificarSemilla("ARROZ", ANGULO_ARROZ);
  delay(PAUSA_ENTRE_PRUEBAS_MS);

  clasificarSemilla("FRIJOL", ANGULO_FRIJOL);
  delay(PAUSA_ENTRE_PRUEBAS_MS);

  clasificarSemilla("ARBEJA", ANGULO_ARBEJA);
  delay(PAUSA_ENTRE_PRUEBAS_MS);

  clasificarSemilla("MAIZ_PIRA", ANGULO_MAIZ_PIRA);

  Serial.println("--- Fin de prueba ---");
}
