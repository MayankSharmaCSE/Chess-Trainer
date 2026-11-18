# Windows Setup Guide (Chess-Trainer / ChessLens)

This project was developed on macOS. This guide covers the exact steps to run it
on **Windows**. It assumes the project was extracted to `C:\Chess-Trainer`
(adjust the path if yours differs) and that all commands run in **PowerShell**.

The app has two parts:
- **Backend** (`backend/`): FastAPI + Python, SQLite by default, uses Stockfish for analysis.
- **Frontend** (`frontend/`): Next.js 16 / React 19, runs on port 3000 and talks to the backend on port 8000.

Both must be running at the same time (in two separate terminals).

---

## 1. Prerequisites (install once)

1. **Python 3.12** — download from https://www.python.org/downloads/windows/
   - During install, tick **"Add python.exe to PATH"**.
   - Must be 3.10 or newer (the code uses `str | None` syntax). Avoid 3.13 — some wheels lag.
2. **Node.js 22 LTS** — download from https://nodejs.org/
   - Next.js 16 requires Node >= 20.9.
3. **Stockfish (Windows build)** — download from https://stockfishchess.org/download/
   - Unzip to a folder **with no spaces**, e.g. `C:\Stockfish\`.
   - Note the exact `.exe` name, e.g. `stockfish-windows-x86-64-avx2.exe`.

Verify Python and Node are on PATH:

```powershell
py -3.12 --version
node --version
npm --version
```

---

## 2. Backend: create the virtual environment and install deps

```powershell
cd C:\Chess-Trainer\backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

> If activation is blocked by execution policy, run this once, then re-run `Activate.ps1`:
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```

---

## 3. Configure `backend\.env`

Open `C:\Chess-Trainer\backend\.env` and set `STOCKFISH_PATH` to your Stockfish
`.exe`, using **forward slashes** (`/`) and the real path you noted in step 1:

```
JWT_SECRET=dev-only-change-me
JWT_EXPIRE_DAYS=7
DATABASE_URL=sqlite:///./data.db
FRONTEND_URL=http://localhost:3000
STOCKFISH_PATH=C:/Stockfish/stockfish-windows-x86-64-avx2.exe
```

Notes:
- The default `STOCKFISH_PATH` is just `stockfish` (expects it on PATH). On Windows
  you almost always need to set the full path as above, or game analysis will fail.
- AI coaching is **optional**. Without an `LLM_API_KEY` the app runs normally and the
  coaching endpoint returns a graceful `503`. Do **not** put a URL in `LLM_API_KEY`.

Test that Stockfish loads:

```powershell
python -c "import chess.engine as e; eng=e.SimpleEngine.popen_uci(r'C:/Stockfish/stockfish-windows-x86-64-avx2.exe'); print(eng.id); eng.quit()"
```

---

## 4. Run the backend (keep this terminal open)

```powershell
cd C:\Chess-Trainer\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000 --env-file .env
```

The `--env-file .env` flag is **required** — the config only reads environment
variables, so without it your `.env` (including `STOCKFISH_PATH`) is ignored.

Verify:
- Health: http://localhost:8000/healthz  -> `{"ok":true}`
- API docs: http://localhost:8000/docs

The database (`backend/data.db`) is created automatically on first run.

---

## 5. Run the frontend (open a NEW PowerShell terminal)

```powershell
cd C:\Chess-Trainer\frontend
npm install
npm run dev
```

> Use `npm install` (not `npm ci`). The macOS-generated lockfile was removed from the
> shared zip, so `npm install` regenerates it with the correct Windows binaries.

Then open **http://localhost:3000**, sign up, connect a Chess.com/Lichess account,
and run analysis.

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| UI shows "Backend is not running" (503) | The backend terminal isn't up on :8000. Re-run step 4. |
| Analysis fails / no engine | `STOCKFISH_PATH` is wrong. Re-check the path with forward slashes; run the test in step 3. |
| `py -3.12` not found | Python wasn't installed with PATH, or use `python -m venv .venv` instead. |
| `Activate.ps1 cannot be loaded` | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then re-activate. |
| `npm ci` errors about platform/swc | Use `npm install` instead (the darwin lockfile was removed). |
| Port 3000/8000 already in use | Close the other process, or change the port in the run command. |

---

## Quick reference (copy-paste)

**Terminal 1 — backend:**
```powershell
cd C:\Chess-Trainer\backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# set STOCKFISH_PATH in .env first (step 3)
uvicorn app.main:app --reload --port 8000 --env-file .env
```

**Terminal 2 — frontend:**
```powershell
cd C:\Chess-Trainer\frontend
npm install
npm run dev
```
