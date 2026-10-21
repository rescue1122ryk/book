# JINNAH STATIONARY POS — Setup Guide

## 1. Create Google Sheet

1. Go to https://sheets.new
2. Rename it: `JINNAH POS DATABASE`
3. Copy the Sheet ID from URL: `https://docs.google.com/spreadsheets/d/**THIS_PART**/edit`

## 2. Paste Backend Code

1. In the Sheet → Extensions → Apps Script
2. Delete default code, paste the entire `Code.gs` content
3. Replace `PASTE_YOUR_SHEET_ID_HERE` with your Sheet ID from step 1
4. Save (Ctrl+S)

## 3. Run Setup

1. In Apps Script, select `setup` from function dropdown, click Run
2. Authorize when Google asks (spreadsheet access)
3. All 19 sheets are created automatically
4. Default login: `admin` / `admin123` (change immediately!)

## 4. Deploy as Web App

1. Apps Script → Deploy → New deployment
2. Select type: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Click Deploy → copy the URL (ends with `/exec`)
6. Test it: paste URL in browser + `?action=ping` → should show JSON

## 5. Configure Frontend

1. Open `pos-config.js`
2. Paste your deployment URL in `API_URL`
3. Save

## 6. Upload to GitHub Pages

1. Upload these files to your repo:
   - `pos.html`, `pos.css`, `pos-config.js`, `pos-api.js`, `pos-ui.js`, `pos-receipt.js`, `pos-reports.js`
   - Your existing `category-checker.html`, `jszip.min.js`, `report-cnic.js`, `report-passport.js`
3. Commit & push
4. Visit `https://YOUR_USERNAME.github.io/YOUR_REPO/pos.html`

## 7. First Login

1. Open `pos.html` → login screen
2. Username: `admin` Password: `admin123`
3. **Change password immediately** (edit `Users` sheet — ask developer for helper function)

## 8. Daily Workflow

- **Morning**: Cash Register → Open Register (enter opening cash)
- **Sales**: New Sale tab → scan/search → add to cart → Complete Sale (receipt prints automatically)
- **Evening**: Cash Register → Close Register (enter actual cash counted)
- **Reports**: Dashboard shows today's numbers; Reports tab for date ranges

## 9. Backup

Every week: File → Make a copy of the Google Sheet. Keep copies in Drive folder.

## 10. Troubleshooting

| Error | Fix |
|---|---|
| `Not authenticated` | Session expired. Login again. |
| `HTTP 0` or CORS | Deployment not set to "Anyone" access. Redeploy. |
| `Insufficient stock` | Product stock too low — purchase more or enable `AllowNegativeStock` in Settings sheet |
| `Missing sheet: X` | Run `setup` again |
| Slow responses | Apps Script free tier has quotas. Close unused tabs. |
| `Paid exceeds total` | Check that `paid` value doesn't exceed cart total |

## 11. Urdu / English

Click the top button **اردو / EN** to toggle interface language.

## 12. Print Receipts

Both A4 (for records) and 80mm thermal (for customers) print automatically on every sale. To change:
- Edit `pos-config.js` → `PRINT_RECEIPT: 'a4' | 'thermal' | 'both'`

## 13. Known Limitations (Free Tier)

- Apps Script: ~20,000 executions/day, 6min/execution
- Sheets API: ~100 requests per minute per user
- Realistic concurrency: 1-2 cashiers maximum
- Daily backup recommended

## Support

- Owner: Shahid Jamil, Rescue 1122 RYK — 03017631541