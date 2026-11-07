# 0010: Amigos con código y solicitudes

**Estado:** aceptada

**Fecha:** 2026-11-07

## Contexto

El panel de amigos debe dejar agregar a alguien, ver quién está estudiando y entrar a su sala. Los nombres se repiten y el correo es privado, así que no sirven para encontrar a una persona.

## Decisión

- Cada cuenta tiene un **código de amigo** de 8 caracteres, por ejemplo `EFGM-E8K8`, que se comparte por fuera de la app. Las cuentas que ya existían reciben el suyo la primera vez que abren el panel.
- Agregar a alguien le envía una **solicitud**, que puede aceptar o rechazar. Si las dos personas se envían una, quedan como amigos sin más pasos.
- La amistad se guarda dos veces, una por dirección, para que buscar los amigos de alguien sea una consulta simple.
- El servidor sabe en qué sala está cada cuenta y si está estudiando, en la memoria, igual que las salas. Solo se lo muestra a sus amigos.
- El panel se actualiza cada 10 segundos mientras se ve el menú, y se detiene dentro de una sala o con la pestaña oculta.

## Alternativas descartadas

- **Agregar por nombre:** dos personas pueden llamarse igual, y no habría forma de saber a quién se agrega.
- **Avisar los cambios por Socket.IO:** sería instantáneo, pero hay que avisar a cada amigo en cada cambio de periodo. Consultar cada 10 segundos alcanza para saber quién está estudiando.

## Consecuencias

- Tus amigos ven el código de la sala donde estás, y pueden entrar a ella.
- Un código de amigo no se puede cambiar todavía, aunque se haya compartido con alguien que no se quería.
- Hay un límite de 200 amigos, 50 solicitudes sin responder y 30 intentos de agregar cada 15 minutos.
