#include <Servo.h>

Servo servo;

void setup() {
  servo.attach(10);
}

void loop() {
  servo.write(0);     // un sentido, si es continuo
  delay(3000);

  servo.write(90);    // parar, si es continuo
  delay(2000);

  servo.write(180);   // otro sentido, si es continuo
  delay(3000);

  servo.write(90);    // parar
  delay(2000);
}
