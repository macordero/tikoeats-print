# Tiko Impresión

App de escritorio (Windows y Mac) que imprime sola las comandas y los tiquetes de
los pedidos de Tiko. Se instala en la computadora de la caja, se vincula con un
código de 6 dígitos del panel y queda trabajando en la bandeja del sistema.

## Cómo funciona

- **Vincular:** Panel › Configuración › Impresoras y tickets › *Automática con app
  de PC* › **Vincular computadora** da un código (vence en 10 min). Se escribe en
  la app y se elige la sucursal. La app recibe una llave propia (guardada cifrada
  con el llavero del sistema); nunca pide la contraseña de Tiko.
- **Imprimir:** cuando se acepta un pedido en cualquier dispositivo, Tiko crea un
  trabajo de impresión (según los interruptores de impresión automática del
  panel). La app pregunta cada 3 segundos, imprime con el **mismo diseño de
  tiquete del panel** (`src/tiko/lib/printing` es copia de `src/lib/printing` del
  panel) en las impresoras marcadas para ese tipo de tiquete, y avisa el
  resultado. Si falla, Tiko lo reintenta (3 veces). Lo que tenga más de 2 horas
  sin imprimirse se descarta.
- **Impresoras:** usa las impresoras instaladas en el sistema (driver de
  Windows / CUPS en Mac), sin diálogo.

## Desarrollo

```
cp .env.example .env        # y completá VITE_SUPABASE_ANON_KEY (valor público)
npm install
npm run dev
```

## Instaladores

Se generan en GitHub Actions (`.github/workflows/release.yml`) al subir una
etiqueta de versión:

```
npm version patch           # sube la versión en package.json y crea la etiqueta
git push --follow-tags
```

Quedan en la pestaña Actions (artefactos) y, si está el secreto
`SUPABASE_SERVICE_ROLE_KEY`, se publican en Supabase Storage:
`apps/print/Tiko-Impresion-Setup.exe` y `apps/print/Tiko-Impresion.dmg`
(los botones "Descargar" del panel apuntan ahí).

**Sin firma digital todavía:** Windows muestra "Windows protegió su PC" (Más
información › Ejecutar de todas formas) y en Mac se abre con clic derecho › Abrir.

## Mantener igual al panel

Si cambia el diseño del tiquete en el panel (`src/lib/printing/*` o los mapeos
de pedido/sucursal), copiar los mismos archivos a `src/tiko/` y publicar una
nueva versión.
