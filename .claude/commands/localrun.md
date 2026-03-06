# Local Run — Start Frontend Dev Server

Start the frontend dev server locally so the user can preview changes without waiting for deployment.

## Steps

### Step 1: Check for port conflicts

Run `lsof -ti:5173` to check if port 5173 is already in use. If it is, kill the existing process after informing the user.

### Step 2: Start the dev server

Run `cd /home/veent-ojt/Downloads/Bidtomo/frontend && npm run dev` in the background using Bash.

### Step 3: Confirm

Tell the user the dev server is running at **http://localhost:5173** and they can open it in their browser. Remind them that the frontend connects to the CMS backend configured in their `.env` file (`CMS_URL`).
