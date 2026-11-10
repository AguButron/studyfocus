# 0005: Compartir la actividad ahora, sin esperar los avatares

**Estado:** aceptada

**Fecha:** 2026-11-02

## Contexto

Se quería que los demás vieran cómo se mueven las manos de cada persona. La duda era si hacerlo ahora o esperar a tener los avatares y sus texturas, ya que en la [decisión 0003](0003-primera-persona-al-estudiar.md) se había dejado abierta la posibilidad de hacerlo junto con las animaciones de la fase 6.

## Decisión

Se hace ahora, reutilizando los mismos modelos de computador, libro, cuaderno y brazos, con las mangas del color de cada personaje.

Cada persona envía al servidor su actividad, su periodo y si su temporizador está corriendo. El servidor valida esos datos y los reenvía a la sala, y quien entra después los recibe al llegar. Las manos de cada persona se animan en el navegador de quien mira, así que solo se envían los cambios y no cada movimiento.

**Desde el 2026-11-10** también envía si su temporizador ya empezó (`isStarted`). Sentado y sin empezar, no hay nada sobre la mesa (ni computador, ni libro, ni cuaderno). En pausa, las cosas siguen ahí y la persona solo se queda quieta. Antes las dos situaciones se veían igual, y al pausar desaparecían las cosas.

## Alternativas descartadas

- **Esperar a los avatares:** esos datos hacían falta de todas formas para la tarea de compartir el periodo y la actividad, y dibujarlos con los modelos actuales cuesta poco. Además, ayuda a la idea central del proyecto: ver que tus amigos también están trabajando.

## Consecuencias

- Al llegar los avatares habrá que rehacer los brazos y los objetos, pero no lo que se envía por la red.
- Hay más objetos en la escena: un modelo por cada persona sentada, lo que hace más necesario reducir el redibujado.
- El estado se envía con un temporizador aparte del bucle de dibujo, porque ese bucle se detiene al estudiar con la pestaña oculta. En una pestaña oculta, el navegador puede retrasar ese aviso hasta cerca de un minuto.
