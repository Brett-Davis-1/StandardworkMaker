# Standard Work Creator

A lightweight web app for timing a process and tagging activity in real time.

## Features
- Live camera view (optional)
- Stopwatch with millisecond precision
- One-tap tags: `Value Added`, `Non-Value Added`, `Waste`, `Pause`
- Event log with elapsed time + timestamp
- CSV export for captured events

## Files
- `index.html`
- `styles.css`
- `app.js`

## Publish To GitHub

1. Create a new empty repository on GitHub (example: `standard-work-creator`).
2. In this folder, run:

```powershell
git init
git add .
git commit -m "Initial commit: standard work creator app"
git branch -M main
git remote add origin https://github.com/<your-username>/standard-work-creator.git
git push -u origin main
```

## Test On Phone (Recommended: GitHub Pages)

1. On GitHub, open your repo.
2. Go to `Settings` > `Pages`.
3. Under `Build and deployment`:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main` and `/ (root)`
4. Save.
5. Wait 1-2 minutes for deploy.
6. Open your live URL:
   - `https://<your-username>.github.io/standard-work-creator/`

## Camera Notes (Important)
- Phone browsers usually require **HTTPS** for camera access.
- GitHub Pages uses HTTPS, so camera should work there.
- If camera permission is denied, you can still run timer + tags without video.

## Local Same-WiFi Option (No GitHub)

From this folder on your computer:

```powershell
python -m http.server 8080
```

Then on your phone (same Wi-Fi), open:

```text
http://<your-computer-local-ip>:8080/
```

Note: camera may not work on non-HTTPS local addresses depending on phone/browser rules.
