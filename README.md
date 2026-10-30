# LineFlow Manufacturing website

This package contains the consulting-first LineFlow Manufacturing website.

- `/index.html` sells Brett Davis's assembly-line improvement service.
- `/software/index.html` preserves the software-focused LineFlow page.
- `/processor/index.html` processes time studies and exports line-balance, critical-path, and daily-capacity workbooks.
  Its Allowance (%) setting defaults to 0 and uses observed time × (1 + allowance / 100). Review inputs retain observed times; adjusted times drive planning and exports. Changing the allowance clears calculated scenarios so they can be recalculated. Study Data sheets include both times and the allowance used.
  Enter a Product name and use Save product to retain reviewed rows, photos, production settings, and precedence constraints in this browser's IndexedDB storage. Saving the same name updates that product. Use Saved products → Load product to resume, or New product for a clean study. Calculated scenarios are regenerated after loading. Saved products are specific to the browser and site address; clearing site data removes them.
  Processor work elements also accept optional free-text Parts consumed. This is saved with the product and exported below Process Sketch and above Tool in current-state and future-state PAAG sheets; empty entries remain blank.
  The precedence chart labels tiles with their source ZIP and initially groups each ZIP in its own column, with a blank column between groups. Shift-click selects a range in visual order; Ctrl-click or Command-click toggles individual tiles. Drag selections between columns or to any vertical position, including leaving blank space above a tile. Layouts and relationships are saved with the product. Group by ZIP resets the layout while preserving relationships and station constraints.
- `/timestudy/index.html` shows the current process number, previous process name, and photo status. The Snapshot control is red until the active process has a photo, then green.
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

The analysis page runs calculations in the browser. Its Excel export loads ExcelJS and JSZip from jsDelivr; the printable report works without those libraries. Run the checks locally with `node --test tests/cycle-analysis.test.cjs tests/cycle-timer.test.cjs tests/processor-precedence.test.cjs`.

Products saved at a local preview address do not automatically transfer to the public site, a different browser, or another browser profile. Keep using the original address and browser profile to access those local products.
