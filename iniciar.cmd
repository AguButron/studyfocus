@echo off
rem Levanta StudyFocus para desarrollo: el servidor (puerto 3000) y la página (puerto 5173),
rem cada uno en su ventana. Para apagarlos, cierra las ventanas o aprieta Ctrl + C en cada una.
cd /d "%~dp0"
start "StudyFocus - servidor" cmd /k npm run dev --prefix server
start "StudyFocus - pagina" cmd /k npm run dev --prefix client
rem Espera a que la página esté lista y la abre en el navegador
timeout /t 4 /nobreak >nul
start "" http://localhost:5173
