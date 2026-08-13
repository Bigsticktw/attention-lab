# Attention Lab

Closed-loop focused attention training and tracking PWA. Each round asks for an honest success/lapse report and changes the next interval only after a two-result confirmation window.

## Daily completion rule

The minimum daily condition is one reported `Success`. A lapse is still valid training data, but the auxiliary task remains open until one successful round is completed.

## Local development

```powershell
npm install
npm run dev
```

Run quality checks with `npm test`, `npm run lint`, and `npm run build`.

## Google Sheets connection

1. Create a Sheet with tabs `Rounds`, `Sessions`, `Daily`, and `Attention Tests` using the headers in `apps-script/Code.gs`.
2. Create a standalone Google Apps Script project and copy `apps-script/Code.gs` and `apps-script/appsscript.json`.
3. Add Script Properties: `SPREADSHEET_ID` and a random `API_TOKEN`.
4. Deploy as a Web App, executing as yourself and allowing anyone with the URL.
5. In Attention Lab → Settings, save the Web App `/exec` URL and the same token.

The public bundle contains neither value. They are stored only in the browser profile that enters them.

## Data contract

- `Rounds`: immutable raw round evidence.
- `Sessions`: one row per completed session.
- `Daily`: one upserted daily aggregate.
- `Attention Tests`: reserved for the independent SART phase.

Queued writes remain in local storage until the API is reachable again.
