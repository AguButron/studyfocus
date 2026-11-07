# 0009: Cuenta obligatoria y menú principal

**Estado:** aceptada. Reemplaza la parte de la [decisión 0008](0008-cuentas.md) que hacía opcional la cuenta.

**Fecha:** 2026-11-07

## Contexto

La pantalla inicial pedía un apodo y, si se quería, una cuenta. Lo que viene (amigos, estadísticas, tienda y perfil) necesita saber quién es cada persona, y una pantalla con un apodo no deja lugar para esos paneles.

## Decisión

- Para entrar a una sala hay que iniciar sesión. El servidor lo exige al crear o unirse, y el apodo en la sala es el nombre de la cuenta.
- Al crear una cuenta se pide un nombre, que se puede cambiar en el perfil.
- Después de iniciar sesión se ve un menú con los paneles Salas, Amigos, Estadísticas, Tienda y Perfil. Por ahora, Amigos, Estadísticas y Tienda solo dicen qué tendrán.
- Una sala tiene un tipo. Hoy hay uno, la sala de estudio, y el servidor rechaza cualquier otro. Los tipos están en `client/src/roomKinds.ts` y en `ROOM_KINDS` del servidor.
- Todas las salas se guardan, porque todas tienen una dueña. Esto cambió: ahora se borran al quedar vacías ([decisión 0014](0014-salas-vacias-se-borran.md)).
- Un link de invitación lleva a la pantalla de inicio de sesión, y después directo a esa sala.
- El botón **Salir** de la sala vuelve al menú.

## Alternativas descartadas

- **Seguir dejando entrar con apodo:** es más rápido para un amigo invitado, pero obliga a mantener dos caminos, y los amigos, las estadísticas y la tienda no funcionarían para quien entra así.

## Consecuencias

- Un amigo invitado tiene que crear una cuenta antes de entrar por primera vez.
- Sin `DATABASE_URL` no se puede usar la app, ni siquiera mientras se desarrolla.
- Cambiar el nombre no afecta la sala en la que ya se está: vale desde la próxima vez que se entra.
