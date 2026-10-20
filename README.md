# LineFlow Manufacturing website

This package contains the consulting-first LineFlow Manufacturing website.

- `/index.html` sells Brett Davis's assembly-line improvement service.
- `/software/index.html` preserves the software-focused LineFlow page.
- `/processor/index.html` processes time studies and exports line-balance, critical-path, and daily-capacity workbooks.
- `/cyclestudy/index.html` records repeated unit cycle times, excluding pauses, and exports CSV.
- `/cycleanalysis/index.html` imports those CSVs for distributions, SPC, study comparison, Excel workbooks, and printable reports.
- `/consulting.css` styles the simple consulting homepage.
- `/styles.css` styles the preserved software page.
- `/assets/brett-davis.jpg` is shared by both pages.

## Company images

The experience cards describe Brett's employment background, not LineFlow clients or endorsements.

- Husco and XES: original images supplied by Brett.
- Trane Technologies: https://www.tranetechnologies.com/content/dam/cs-corporate/images/logos/logo-TT.svg
- Toyota Material Handling: https://www.toyotaforklift.com/etc.clientlibs/tmh/clientlibs/clientlib-site/resources/images/tmh-login-popup-logo.svg

All images are included locally in `assets/`; the company cards do not depend on third-party image requests.

## Publish with GitHub Pages

Copy the contents of this folder into the root of the existing GitHub Pages repository, preserving the folder structure. Keep the included `CNAME` file so the custom domain remains `lineflowmfg.com`.

After publishing, verify:

1. `https://lineflowmfg.com/`
2. `https://lineflowmfg.com/software/`
3. Both Contact Brett links open a new email.
4. The LineFlow demo loads on the software page.
5. The processor and both cycle-study pages load. The analysis page can import stopwatch CSVs and export an Excel workbook with statistics and editable charts.

The analysis page runs calculations in the browser. Its Excel export loads ExcelJS and JSZip from jsDelivr; the printable report works without those libraries. Run the cycle-study checks locally with `node --test tests/cycle-analysis.test.cjs tests/cycle-timer.test.cjs`.
