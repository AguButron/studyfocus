# 0027: Elegir el asiento con un clic, sin caminar por la sala

**Estado:** aceptada. Reemplaza el moverse con WASD o las flechas y sentarse con la tecla E.

**Fecha:** 2026-11-10

## Contexto

En la sala había que caminar con WASD o las flechas hasta una silla y apretar E para sentarse. Caminar no aporta al estudio. Además cuesta más a quien no juega videojuegos, y en un celular no se puede.

## Decisión

- **Al entrar a una sala** se ve desde arriba, con las sillas libres iluminadas en verde y el aviso "Haz clic en una silla libre para sentarte". La silla bajo el mouse se ilumina más y el cursor cambia.
- **Un clic en una silla libre** te sienta ahí y abre el temporizador, como antes. Si otra persona la tomó justo antes, el servidor la rechaza y se pide elegir otra.
- **"Cambiar de asiento"** reemplaza a "Levantarte": deja la silla y vuelve a la vista de arriba para elegir otra. Igual que antes, no se puede mientras corre un periodo de estudio.
- **Sin silla no se ve el personaje:** ni el propio ni el de los demás. En la tarjeta de una persona que aún no se sienta se lee "Eligiendo asiento".
- **Los demás aparecen en su silla:** su posición se toma del número de silla, ya no de las coordenadas que mandaba cada página al caminar.
- Ya no se usan la tecla E ni las flechas en la sala. La tecla C sigue cambiando de cámara.

## Alternativas descartadas

- **Caminar y además poder hacer clic:** dos formas de hacer lo mismo, y mantener las colisiones con mesas y paredes solo para caminar.
- **Elegir la silla en el menú, antes de entrar:** desde el plano no se ve quién está sentado dónde ni cómo es la sala.

## Consecuencias

- La página ya no manda su posición (`player:move`). El servidor todavía acepta ese mensaje, pero nadie lo usa.
- Se quitaron las colisiones de `room.ts`. Las sillas ahora se pueden apuntar con el mouse y se pueden iluminar.
- La portada dice "Haz clic en una silla libre" en vez de "Camina con tu personaje hasta una silla libre".
