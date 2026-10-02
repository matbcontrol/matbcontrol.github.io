# matbcontrol.github.io

Portfolio of Aleksandr Kartak, Unity developer and technical artist: https://matbcontrol.github.io/

The site is a static page built as a game pause menu, plus three project pages. The command menu on the first screen is the navigation. Behind it, a WebGL fragment shader recolours frames from projects I worked on into a five-step palette. There is no build step and no framework.

## Structure

```
index.html          content, head script, dialogs, inline SVG sprite and filters
cyber-abyss.html    project pages: same stylesheet, core.js, HUD and footer
apothecarys-dungeon.html
game-jams.html
assets/css/site.css all styles
assets/js/core.js   menu, HUD, dialogs, gallery, reveal, settings (deferred)
assets/js/sea.js    WebGL background, injected by core.js when the page is idle
assets/work/        screenshots (imageN-640.jpg / imageN-1280.jpg; the PNGs are sources and are not used by the page)
assets/sea/         shader textures and still fallbacks
assets/img/         contact duotone
assets/icons/       favicon.svg, apple-touch-icon.png
tools/              local QA helpers
```

Without JavaScript the page is still a normal scrolling document: every section, link and image is in the HTML.

## Local development

WebGL textures will not load from `file://`, so serve the folder over HTTP:

```
node tools/serve.js 8080
```

Then open http://127.0.0.1:8080/. `tools/shot.mjs` takes headless Chrome screenshots for QA; its options are listed at the top of the file.

## Credits

Visual language inspired by the menu design of Persona 3 Reload (ATLUS). Unofficial fan-inspired UI study; no ATLUS assets, fonts, audio or code are used. Not affiliated with or endorsed by ATLUS/SEGA.

Fonts: Archivo, Asap, Jost and JetBrains Mono via Google Fonts. All screenshots are from projects I worked on.
