# 0035: Salir de la sala por inactividad

**Estado:** aceptada.

**Fecha:** 2026-11-16

## Contexto

Alguien podía entrar a una sala y quedarse ahí sin sentarse, o sentado sin estudiar, por horas: ocupaba una silla que otro podía usar y dejaba la sala abierta en el servidor.

## Decisión

- **Parado sin sentarse 5 minutos** (en las salas compartidas) o **sentado sin estudiar ni descansar 30 minutos** (con el temporizador sin empezar o en pausa) hace salir de la sala. El descanso del temporizador cuenta como actividad. En el estudio individual solo vale la regla de los 30 minutos, porque ahí ya se parte sentado.
- **Un minuto antes, un aviso** con el botón **Sigo aquí**: "Siéntate o saldrás de la sala en 1 minuto", o "Llevas casi 30 minutos sin estudiar ni descansar…". Sentarse, empezar el temporizador o apretar Sigo aquí hace que el tiempo vuelva a contar desde cero.
- **Al salir, el menú lo dice:** "Desconectado/a por inactividad", con el motivo en una línea ("5 minutos sin sentarte" o "30 minutos sin estudiar ni descansar").
- **Lo controla el servidor**, no la página: con la pestaña oculta o cerrada el navegador detiene sus relojes, y nunca saldría. Cada 15 segundos revisa a cada persona conectada (`idleReason` y el `setInterval` en `server/src/index.ts`). Los tiempos están en `IDLE_LIMITS` e `IDLE_WARNING`. Quien perdió la conexión no cuenta: esa sale sola a los 15 segundos (`RECONNECT_WAIT`).
- Salir así es igual que salir con el botón: si había un periodo de estudio a medias, se abandona.

Probado con los tiempos acortados: el aviso aparece, sin hacer nada se sale con el mensaje, y con Sigo aquí se sigue en la sala pasado el límite.

## Alternativas descartadas

- **Medirlo en la página:** con la pestaña oculta o el computador suspendido, los relojes del navegador se detienen.
- **Sacar sin avisar:** alguien que está leyendo o pensando se iría sin entender por qué.
