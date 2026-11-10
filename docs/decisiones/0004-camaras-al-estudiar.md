# 0004: Una cámara para preparar y tres para estudiar

**Estado:** aceptada

**Fecha:** 2026-11-02

## Contexto

Al sentarse, la cámara pasaba directo a primera persona, aunque todavía se estuvieran eligiendo los minutos. Además, se quería poder mirar a quienes están en la mesa y en la sala, no solo el escritorio.

## Decisión

La cámara depende de si el temporizador ya comenzó:

- **Sin comenzar:** la cámara mira al personaje de frente, desde el otro lado de la mesa, y no se puede cambiar. Antes quedaba detrás de él (cambio del 2026-11-08).
- **Comenzado, incluso en pausa o en descanso:** se elige entre **Escritorio** (primera persona), **Mesa** (desde el costado de la mesa) y **Sala**, con botones o con la tecla C. La elección se recuerda para la próxima vez.
- **Al abandonar la sesión, tras confirmarlo:** el temporizador vuelve a su inicio y se vuelve a la cámara de frente, todavía sentado. Reemplaza al botón **Reiniciar**.

Al comenzar, el panel grande desaparece: queda uno pequeño arriba a la izquierda con el temporizador y sus controles. La actividad se puede cambiar solo con el temporizador en pausa.

**Desde el 2026-11-09** ya no hay un panel con las tres cámaras arriba a la derecha (ahí va el botón de Amigos). Queda un aviso pequeño abajo a la izquierda, "C Cambiar cámara · Escritorio": la tecla C, o un clic en el aviso, pasa a la cámara siguiente, en orden Escritorio → Mesa → Sala.

## Alternativas descartadas

- **Elegir la cámara también antes de comenzar:** agrega opciones justo cuando se está preparando la sesión, y ahí lo útil es ver al personaje ya sentado.

## Consecuencias

- Tu propio apodo se oculta desde atrás, porque a esa distancia tapa la vista.
- Si cambia el ancho de la ventana mientras estás sentado, el encuadre no se corrige hasta cambiar de cámara.
