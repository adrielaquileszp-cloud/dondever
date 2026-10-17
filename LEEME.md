# DóndeVer

Web app (PWA) para tu celular: busca en qué plataforma está cada película, serie o anime en México, muestra novedades por plataforma y te avisa cuando sale un episodio nuevo de los animes que sigues en Crunchyroll.

## 1. Consigue tu API key de TMDB (gratis)
1. Crea una cuenta en https://www.themoviedb.org/signup
2. Ve a Ajustes → API → solicita una clave de tipo «Developer» (uso personal).
3. Copia la **API Key** (o el **API Read Access Token**). La pegarás en la app, en Ajustes.

## 2. Publícala gratis con GitHub Pages
1. Crea una cuenta en https://github.com y luego un repositorio **público** nuevo (por ejemplo `dondever`).
2. En el repositorio: «Add file» → «Upload files» → arrastra **todo el contenido** de esta carpeta (index.html, sw.js, manifest.webmanifest, styles.css y las carpetas `js` e `icons`) → «Commit changes».
3. Ve a Settings → Pages → en «Branch» elige `main` y `/ (root)` → Save.
4. En 1–2 minutos estará en `https://TU-USUARIO.github.io/dondever/`.

## 3. Instálala en tu Pixel
1. Abre esa dirección en Chrome.
2. Menú ⋮ → «Agregar a la pantalla principal» → «Instalar».
3. Abre la app, pega tu API key en Ajustes y activa tus plataformas.
4. En «Mis animes», toca «Activar» para las notificaciones y sigue los animes que quieras.

## Cómo funcionan los avisos
- La app revisa los episodios cada vez que la abres y, si está instalada, Chrome también revisa en segundo plano varias veces al día (Chrome decide la frecuencia).
- Los horarios vienen de AniList, que usa la hora de emisión en Japón; en Crunchyroll el episodio suele aparecer hasta ~1 hora después.
- Si Chrome tiene la app en ahorro de batería, los avisos pueden retrasarse. En Ajustes del Pixel → Apps → Chrome → Batería → «Sin restricciones» ayuda.

## Para actualizar la app
Sube los archivos nuevos al mismo repositorio. Si cambias algo en la app, sube también `sw.js` con el número de `CACHE` aumentado (`dondever-v2`, etc.).
