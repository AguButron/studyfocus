# 0015: La foto de perfil sale del personaje

**Estado:** aceptada. Reemplaza la foto de perfil pendiente de la [decisión 0013](0013-usuario-apodo-y-perfil.md).

**Fecha:** 2026-11-08

## Contexto

Faltaba una foto de perfil. Dejar que cada persona suba la suya obliga a guardar imágenes y a revisar que no sean ofensivas. Además, más adelante cada persona creará su propio personaje.

## Decisión

- Nadie sube imágenes. La foto es el personaje de la persona, dibujado con el mismo modelo 3D de la sala, de frente y un poco desde arriba.
- La base guarda solo cómo se ve el personaje, en la columna `character_look` de `users`. Hoy es el color del cubo, elegido en Perfil entre 8 colores que combinan con la sala.
- Quien no ha elegido tiene un color fijo según su cuenta, así no se ven todos iguales.
- La página dibuja la foto la primera vez que la necesita y la reutiliza. Aparece en Perfil, en el menú, en la lista de amigos y en la tarjeta de cada persona dentro de la sala.
- En la sala, el cubo y las mangas de cada persona tienen el color de su personaje.

## Alternativas descartadas

- **Que cada persona suba una foto:** necesita un lugar para guardar imágenes y moderarlas, y las fotos no combinarían entre sí.
- **Guardar la foto como imagen:** habría que volver a generarlas cada vez que cambie el modelo. Con solo los datos del personaje, las fotos cambian solas.

## Consecuencias

- El creador de personajes agregará datos a la misma ficha (por ejemplo, pelo o ropa). El servidor acepta solo los valores que conoce, y las fotos se actualizan sin hacer nada más.
- El nuevo color se ve en la sala a partir de la próxima vez que se entra a una.
