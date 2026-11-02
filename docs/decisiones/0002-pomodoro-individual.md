# 0002: Usar un Pomodoro individual en vez de uno compartido

**Estado:** aceptada

**Fecha:** 2026-11-02

## Contexto

El plan inicial era un temporizador compartido por mesa. Pero cada persona estudia a su propio ritmo, y la compañía de estar en la misma mesa no exige que todos descansen a la vez.

## Decisión

Cada persona tiene su propio temporizador, con estas características:

- Elige los minutos de estudio y de descanso, y parte del clásico 25-5.
- Puede pausarlo y reanudarlo.
- Corre en su navegador, no en el servidor.

## Alternativas descartadas

- **Un temporizador por mesa:** obliga a todos a seguir el mismo ritmo.
- **Un temporizador por sala:** aún más rígido, porque afecta también a quienes están en otras mesas.

## Consecuencias

- El servidor no lleva el tiempo: solo reenvía el periodo de cada persona, con un mensaje cada vez que cambia.
- Los minutos elegidos y el estado del temporizador se guardan en el navegador de cada persona, así que recargar la página no lo reinicia.
- Los demás ven en qué periodo está cada uno. Esto ayuda a sentirse acompañado, y más adelante permitirá animar al personaje según su periodo.
