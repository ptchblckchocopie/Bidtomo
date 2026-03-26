# Stop Local Dev — Kill All Services

Stop all locally running Bidmoto services.

## Steps

1. Find and kill processes on these ports:
   - **3001** (CMS)
   - **3002** (SSE Service)
   - **5173** (Frontend)

2. Also kill any `ts-node` or `nodemon` processes related to the bid-worker (it doesn't bind a port, so find it by name).

3. Use `netstat` to find PIDs on each port, then `taskkill` to stop them (Windows). If on Linux/Mac, use `lsof -ti:<port> | xargs kill`.

4. Print a summary of what was stopped.

5. Do NOT stop Docker containers — those are managed separately. Only stop the Node.js dev services.
