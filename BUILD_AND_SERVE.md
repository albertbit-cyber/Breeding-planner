Build & serve (quick)

To produce a production build and serve it locally:

- Install dependencies (if you haven't):

```bash
npm install
```

- Create a production build:

```bash
npm run build
```

- Serve the `build/` directory locally using a static server. Two quick options:

Using npx serve (may prompt to install the small `serve` package):

```bash
npx --yes serve -s build -l 5000
```

Or using Python's built-in server (no extra packages):

```bash
python3 -m http.server 5001 --directory build
```

Then open the reported URL (e.g. http://localhost:5000 or http://localhost:5001) in your browser to inspect the built app.

Notes:
- `npm audit` showed some vulnerabilities that require major dependency updates (e.g. `react-scripts`, `jspdf`, `pdfjs-dist`). I ran `npm audit fix` (non-destructive). Remaining issues can be addressed with `npm audit fix --force` or by updating specific packages (may be breaking).
- I also fixed several lint warnings in `src/App.js` that produced build-time warnings.

Desktop installer (Electron)
----------------------------

You can wrap the React build inside a lightweight Electron shell and generate native installers (EXE/MSI/DMG/AppImage). Summary:

1. **Install the new tooling** (only needed once):
   ```bash
   npm install
   ```
   This pulls in `electron`, `electron-builder`, `concurrently`, etc.

2. **Run the desktop shell in development** (starts CRA + Electron together):
   ```bash
   npm run electron-dev
   ```
   - The CRA dev server still listens on port 3000.
   - Electron opens a window pointing at that dev server. Quit with `Ctrl+C`.

3. **Generate installers**:
   - Windows `.exe` (NSIS): `npm run dist:win`
   - macOS `.dmg` / `.zip`: `npm run dist:mac`
   - Linux AppImage + deb/rpm: `npm run dist:linux`
   - All platforms from host OS: `npm run dist` (requires platform-specific toolchains; for Windows targets on macOS/Linux you must install [wine](https://www.winehq.org/) + mono).

Each `dist:*` command runs `npm run build` to produce the React assets, then packages `build/` together with the Electron main process found in `electron/main.js`. Outputs land in `dist/`.

Extra tips:
- Provide a custom Windows icon by placing `public/icon.ico` (256x256) before running `dist:*`.
- When cross-building Windows installers from macOS/Linux, install `brew install --cask wine-stable` (or your distro equivalent) so `electron-builder` can produce `.exe`.
