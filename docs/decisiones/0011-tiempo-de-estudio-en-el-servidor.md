# 0011: El servidor mide el tiempo de estudio

**Estado:** aceptada

**Fecha:** 2026-11-07

## Contexto

Las estadísticas, y más adelante las monedas, dependen del tiempo de estudio. El temporizador corre en el navegador, así que si la página dijera cuánto estudió, cualquiera podría inventarse horas.

## Decisión

- El servidor mide el tiempo con su propio reloj. Cuenta mientras la persona está en una sala, con la conexión abierta y con el temporizador corriendo en un periodo de estudio, según el estado que la página ya comparte con la sala.
- Lo estudiado se guarda en tramos en la tabla `study_segments`: al cambiar de estado, al salir, al cortarse la conexión y cada 5 minutos. Si el servidor se cae, se pierden a lo más esos 5 minutos.
- Un periodo de estudio seguido cuenta como máximo 125 minutos, el periodo más largo del temporizador con margen. Una página alterada que nunca pase al descanso no suma más que eso.
- Los días se cuentan en la zona horaria de la persona, que la página envía al pedir las estadísticas.
- "Con quién estudiaste" son las personas que estudiaban en la misma sala al mismo tiempo, según sus tramos.
- Al salir de una sala, el servidor responde cuánto se estudió en ella y con quién, y el menú lo muestra como resumen.

## Alternativas descartadas

- **Que la página informe los periodos terminados:** es más simple, pero cualquiera podría enviar periodos que no estudió.

## Consecuencias

- Con la pestaña abierta y el temporizador corriendo se suma tiempo aunque no se esté estudiando. Antes de dar monedas por el tiempo, hará falta algo más, como una confirmación ocasional o un límite diario.
- Recargar la página no corta la cuenta: vuelve a contar en cuanto la conexión regresa.
- Un tramo que cruza la medianoche cuenta para el día en que empezó.
