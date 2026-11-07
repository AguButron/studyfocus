# 0012: Música personal, propia o de YouTube

**Estado:** aceptada

**Fecha:** 2026-11-07

## Contexto

Se quiere que cada persona pueda estudiar con música, ya sea la que trae StudyFocus o un video de YouTube, por ejemplo una transmisión de lofi. Subir o copiar música trae problemas de derechos, así que no se hace.

## Decisión

- La música es de cada persona: nadie más la escucha, y la elección se guarda en el navegador.
- Hay dos opciones, en un control abajo a la derecha de la sala:
  - **StudyFocus:** un lofi que se arma en el navegador con Web Audio (acordes, bajo, melodía, bombo y ruido de disco). No usa archivos ni tiene derechos de terceros. Es un ejemplo para probar, que se puede cambiar después por música propia.
  - **YouTube:** se pega un link y el video se reproduce en el reproductor oficial de YouTube, en el modo de privacidad (`youtube-nocookie.com`). Se respeta el segundo de inicio del link.
- El reproductor de YouTube siempre se ve mientras suena, y mide 356 × 200 px, sobre el mínimo de 200 × 200 que exigen las [reglas de YouTube](https://developers.google.com/youtube/terms/required-minimum-functionality). Esas reglas prohíben separar el audio del video y usar un reproductor que no se vea. Para dejar de escucharlo se elige "Sin música".
- Solo se aceptan links de YouTube, y el link no se envía al servidor.

## Alternativas descartadas

- **Solo el audio del video, sin mostrarlo:** distrae menos, pero rompe las reglas de YouTube, que puede bloquear la app.
- **Música compartida por toda la sala:** hay que sincronizar el video y decidir quién lo controla. Queda para después.
- **Un archivo de música incluido:** pesaría más, y habría que conseguir una pista con permiso para usarla.

## Consecuencias

- Insertar un video con el reproductor oficial es de bajo riesgo legal: no se copia nada y YouTube muestra sus anuncios. Los videos cuyo dueño desactivó la inserción muestran el aviso de YouTube.
- Un video con movimiento puede distraer. La persona decide si lo usa.
- El navegador no deja sonar nada antes del primer clic o tecla: al recargar dentro de una sala, la música empieza con la primera interacción.
- Al entrar a una sala, el video de YouTube carga en pausa: parte solo cuando la persona le da play, elige YouTube o pone un link.
