# 0006: Guardar el lugar de quien se desconecta

**Estado:** aceptada

**Fecha:** 2026-11-02

## Contexto

Al recargar, el servidor veía una desconexión: liberaba la silla, avisaba a los demás y, si no quedaba nadie, borraba la sala. Se perdía el lugar en medio de una sesión de estudio.

## Decisión

Cada pestaña genera un identificador secreto y lo guarda en `sessionStorage`. Con él, el servidor la reconoce al volver:

- Al desconectarse, el servidor espera 15 segundos antes de sacar a la persona. Mientras tanto, los demás no notan nada y su silla sigue ocupada.
- Si vuelve a tiempo, sigue en su sala, en su silla o en el lugar donde estaba de pie, sin pasar por la pantalla inicial.
- Si no vuelve, la silla se libera, se avisa a los demás y, si no queda nadie, se borra la sala.

El identificador nunca se reenvía a los demás. Ellos solo conocen un identificador público, que no cambia al volver.

El temporizador en curso también se guarda en `sessionStorage`, para que una pestaña no pise el de otra. Solo los minutos elegidos van en `localStorage`, porque valen para la próxima vez.

## Alternativas descartadas

- **`localStorage`:** se comparte entre pestañas, así que dos pestañas serían la misma persona. Con `sessionStorage` cada una es distinta, lo que además permite probar con dos pestañas.
- **Usar el identificador de la conexión:** cambia con cada conexión, así que no sirve para reconocer a nadie.

## Consecuencias

- Al cerrar la pestaña, los demás siguen viendo a esa persona durante 15 segundos.
- Solo sobrevive a recargas y cortes breves: cerrar la pestaña pierde el lugar y el temporizador, y reiniciar el servidor pierde el lugar. Lo definitivo llegará con las cuentas de la fase 6.
- Duplicar una pestaña copia su identificador: la copia se queda con el lugar y la original pierde la conexión.
- La página se debe servir por HTTPS (o en `localhost`), porque el navegador solo permite generar el identificador en un contexto seguro. Es un requisito para la fase 5.
