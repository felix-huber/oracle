# MCP Smoke Tests (local oracle-mcp)

Use these steps to validate the MCP stdio server before releasing.

Prereqs
- `pnpm build` (ensures `dist/bin/oracle-mcp.js` exists)
- `OPENAI_API_KEY` set in env
- `config/mcporter.json` contains the `oracle-local` entry pointing to `node ../dist/bin/oracle-mcp.js` (already committed)
- mcporter available at `/Users/steipete/Library/pnpm/global/5/node_modules/.bin/mcporter`

Commands
1) List tools/schema to confirm discovery:
   ```bash
   mcporter list oracle-local --schema --config config/mcporter.json
   ```

2) API consult (GPT-5.1):
   ```bash
   mcporter call oracle-local.consult \
     prompt:"Say hello from GPT-5.1" \
     model:"gpt-5.1" \
     engine:"api" \
     --config config/mcporter.json
   ```

3) Sessions list:
   ```bash
   mcporter call oracle-local.sessions hours:12 limit:3 --config config/mcporter.json
   ```

4) Session detail:
   ```bash
   mcporter call oracle-local.sessions id:"say-hello-from-gpt-5" detail:true --config config/mcporter.json
   ```

5) Browser smoke:
   ```bash
   mcporter call oracle-local.consult \
     prompt:"Browser smoke" \
     model:"5.1 Instant" \
     engine:"browser" \
     --config config/mcporter.json
   ```
   Uses a built-in browserConfig (ChatGPT URL + cookie sync) and the provided model label for the picker (heads-up: if the ChatGPT UI renames the model label, this may need an update).

See `docs/mcp.md` for full tool/resource schemas and behavior.
