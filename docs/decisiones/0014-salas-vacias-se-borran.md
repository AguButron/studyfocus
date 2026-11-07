# 0014: Las salas vacías se borran

**Estado:** aceptada. Reemplaza las salas guardadas de la [decisión 0009](0009-cuenta-obligatoria-y-menu.md).

**Fecha:** 2026-11-07

## Contexto

Las salas quedaban guardadas en la base de datos aunque nadie las usara, y aparecían en "Tus salas". Se prefirió que una sala exista solo mientras tiene gente.

## Decisión

- Cuando sale la última persona, la sala se borra de la memoria y de la base de datos, y su link deja de servir.
- Mientras tiene gente, la sala sigue en la base de datos. Así, si el servidor se reinicia (por ejemplo, al publicar un cambio), quienes estaban adentro vuelven a entrar solos.
- Cada 10 minutos se borran las salas que nadie retomó después de un reinicio, y las vacías que quedaron en la memoria.
- Se quitó "Tus salas" del menú.

## Alternativas descartadas

- **Borrar las salas que nadie usa hace 30 días:** conserva los links para volver con los amigos, pero se prefirió que no queden salas sin gente.

## Consecuencias

- Para volver a estudiar con alguien hay que crear una sala nueva y compartir otro link, o entrar a la de un amigo desde el panel de amigos.
- La memoria ya se liberaba antes al quedar vacía; lo que se ahorra ahora es solo la fila de la base de datos.
- Si alguien pierde la conexión y no vuelve en 15 segundos, sale de la sala. Si era la última persona, la sala se borra.
