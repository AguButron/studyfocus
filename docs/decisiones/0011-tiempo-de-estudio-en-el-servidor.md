# 0011: El servidor mide el tiempo de estudio

**Estado:** aceptada

**Fecha:** 2026-11-07

## Contexto

Las estadísticas, y más adelante las monedas, dependen del tiempo de estudio. El temporizador corre en el navegador, así que si la página dijera cuánto estudió, cualquiera podría inventarse horas.

## Decisión

- El servidor mide el tiempo con su propio reloj. Cuenta mientras la persona está en una sala, con la conexión abierta y con el temporizador corriendo en un periodo de estudio, según el estado que la página ya comparte con la sala.
- **Solo cuentan los periodos de estudio terminados** (cambio del 2026-11-07). El servidor anota lo estudiado en la memoria mientras el periodo sigue, y lo guarda en la tabla `study_segments` cuando el periodo termina y empieza el descanso. Si se abandona, si se sale de la sala o si la conexión no vuelve en 15 segundos, no se guarda.
- Cada periodo del temporizador tiene un identificador que la página envía con su estado. Abandonar empieza uno nuevo, y así el servidor distingue una pausa de un abandono. Las pausas no suman, pero no borran lo estudiado antes en el mismo periodo.
- Un periodo de estudio cuenta como máximo 125 minutos, el periodo más largo del temporizador con margen. Una página alterada que nunca pase al descanso no suma más que eso.
- Los días se cuentan en la zona horaria de la persona, que la página envía al pedir las estadísticas.
- "Con quién estudiaste" son las personas que estudiaban en la misma sala al mismo tiempo, según sus tramos.
- Al salir de una sala, el servidor responde cuánto se estudió en ella y con quién, y el menú lo muestra como resumen.

## Alternativas descartadas

- **Que la página informe los periodos terminados:** es más simple, pero cualquiera podría enviar periodos que no estudió.

## Consecuencias

- Con la pestaña abierta y el temporizador corriendo se suma tiempo aunque no se esté estudiando, pero a lo más un periodo: al terminar el descanso el temporizador se detiene hasta que la persona pulse Iniciar. Lo hace la página, así que una página alterada podría saltárselo. Antes de dar monedas por el tiempo, conviene que el servidor también lo exija, o un límite diario.
- Recargar la página no corta la cuenta: vuelve a contar en cuanto la conexión regresa, dentro del mismo periodo.
- Si el servidor se reinicia, por ejemplo al publicar una versión nueva, cada persona vuelve a su silla y con su periodo en curso: la tabla `active_sessions` guarda la sala, la silla y lo estudiado del periodo poco después de cada cambio, y al menos cada minuto. Se pierde a lo más ese minuto y el rato en que el servidor estuvo apagado.
- Un tramo que cruza la medianoche cuenta para el día en que empezó.
