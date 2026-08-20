# Attention Lab

Fixed-duration focused attention training and tracking PWA. Each session defaults to five minutes, can be adjusted from 1 to 60 minutes, and ends with one honest stable/lapse report. The result is recorded but never changes the next session automatically.

## Daily completion rule

The minimum daily condition is one completed timed session. Both `Success` and `Lapse` are valid self-reports and count as a completed session.

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

### Pair a phone

Connection settings are private to each browser. On an already connected device, open **Settings → Show mobile pairing QR code**, then scan it with your own phone. The phone stores the endpoint and token locally and immediately removes the pairing payload from the address bar. Treat the QR as a secret and do not share or screenshot it.

The header reports `Not connected`, `Pending sync`, or `Synced`. Tapping `Not connected` opens Settings.

## Session completion alert

Starting a session unlocks mobile audio. At the end, the app plays a three-note chime and requests vibration when supported. The speaker button in the training header stores the user's sound preference locally. The selected duration is also stored in the current browser.

## Data contract

- `Rounds`: immutable raw evidence; fixed-duration sessions write one compatible round.
- `Sessions`: one row per completed session.
- `Daily`: one upserted daily aggregate.
- `Attention Tests`: reserved for the independent SART phase.

Legacy `threshold`, `max_interval`, and `avg_interval` fields remain populated with the selected duration so existing Sheets and queued requests stay compatible. The current UI treats them as compatibility fields, not as an adaptive attention threshold.

Queued writes remain in local storage until the API is reachable again.
