# Ronda — Panel del dueño (versión computador)

"La siguiente ronda está a un toque"

Versión web del panel del dueño, para usar desde el computador de la barra
(o cualquier navegador), sincronizada en tiempo real con la app del celular
— ambas hablan con la misma base de datos, así que cualquier cambio en una
aparece al instante en la otra.

## Desarrollo local
```
npm install
npm run dev
```

## Instalarla como "app" en el escritorio (PWA)
1. Abre la URL en Chrome o Edge
2. Haz clic en el ícono de instalación en la barra de direcciones (o menú ⋮ → "Instalar Ronda")
3. Queda como un ícono en el escritorio que abre directo, sin barra de navegador — se siente como una app de verdad

## Despliegue
Pensado para Vercel: conecta este repo, framework "Vite", sin configuración
adicional. Una vez desplegado, comparte esa URL — es la misma que se manda
por WhatsApp desde el botón "🔗 Compartir acceso web" dentro del panel, y la
misma que se usa en el botón equivalente de la app de celular.
