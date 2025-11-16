# Breeding Planner

Breeding Planner is a React + Vite application that can run in the browser or inside an Electron shell for an offline desktop experience.

## Prerequisites

- [Node.js 20+](https://nodejs.org/) (ships with npm)
- macOS, Linux, or Windows. Cross-building the Windows installer on macOS/Linux additionally requires [Wine](https://www.winehq.org/).

Install dependencies once:

```bash
npm install
```

## Web development workflow

- `npm run dev` – start Vite at http://localhost:5173.
- `npm run build` – produce a production build in `build/`.
- `npm run preview` – preview the last build.

## Desktop workflow (Electron)

- `npm run electron-dev` – runs Vite and launches Electron pointing at the dev server (quits with `Ctrl+C`).
- `npm run dist:win` – builds the renderer and produces a Windows NSIS installer in `dist/`.
- `npm run dist:mac` / `npm run dist:linux` – platform specific installers; `npm run dist` builds all targets supported on the host OS.

### Making a Windows installer

1. Ensure dependencies are installed (`npm install`) and, if you are not on Windows, install Wine so Electron Builder can create `.exe` files.
2. Run:
   ```bash
   npm run dist:win
   ```
3. When the command finishes you will find `Breeding Planner Setup.exe` inside the `dist/` directory along with the unpacked app.

The installer bundles the production build generated under `build/` together with `electron/main.js`. Update `public/app-icons` before building if you need a different icon.
