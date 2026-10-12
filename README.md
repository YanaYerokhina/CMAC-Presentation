# CMAC Presentation Studio

A web app that turns **Excel workbooks into CMAC-themed HTML presentations**, lets the team **edit them visually** (no code), and **shares them with clients**. It's built on the CMAC deck theme: same fonts, tokens, components and deck engine as the Walla Walla Clinic proposal.

## Quick start

```bash
npm install
ADMIN_EMAIL=you@cmacpartners.com ADMIN_PASSWORD='choose-a-password' npm start
# open http://localhost:3000
```

The first start creates the database (`data/studio.db`), your admin account, the main theme, and demo content (the Walla Walla Clinic deck plus a deck built from the Excel template). If you leave out `ADMIN_PASSWORD`, a random one is printed to the console. Set `SEED_DEMO=0` to skip the demo content.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `data/studio.db` | SQLite database file |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | `admin@cmac.local` / random | First admin, created only when there are no users yet |
| `COOKIE_SECURE` | off | Set to `1` when served over HTTPS |
| `TRUST_PROXY` | off | Set (for example to `1`) behind a reverse proxy |

Run the tests with `npm test`.

## Roles

| | Admin | Team member (developer) | Client |
|---|:-:|:-:|:-:|
| Edit the main theme | ✅ | view only | — |
| Invite people, change roles | ✅ | — | — |
| Upload Excel, create, import, edit, delete presentations | ✅ | ✅ | — |
| Download HTML and source files | ✅ | ✅ | — |
| Manage companies | ✅ (and delete) | ✅ | — |
| View presentations | all | all | **published** ones for **their company** only |

**Sign-in is invitation-only.** An admin invites an email address with a role (and a company, for clients) under *Users & invites*, and gets a link to send. The invited person opens the link, or chooses *Activate your invitation* on the sign-in page with that email, and sets a password. Sign-in checks the email: an unknown address is told to ask for an invitation, and an invited address that hasn't been activated yet is sent to the activation step.

## Building a presentation from Excel

Download the template from *Presentations › Excel template*. It has:

- **Deck**: Title, Company (the client company, created automatically if new), Footer.
- **Slides**: one row per slide: `Layout | Title | Eyebrow | Number | Subtitle | Body | Items | Data | Footnote | Background | Chart | Format`.
- **Data sheets**, referenced from the `Data` column:
  - lists: `Title`, `Description` (plus optional `Number`, `Label`, `Value`)
  - tables: the first row is the header; fill a cell with a color to mark it as the best term
  - charts: the first column holds the labels, and each further column is a series

Layouts: `cover`, `statement`, `text`, `story`, `list`, `agenda`, `kpis`, `columns`, `bullets`, `glossary`, `table`, `chart` (bar / column / donut), `divider`, `close`.
In any text cell, `**bold**` makes text bold and `((word))` draws the CMAC ring highlight around a word.

**Any other workbook works too.** Without a `Slides` sheet, you get a cover, one table slide per sheet, and a closing slide.

You can also **import an existing HTML deck** (*Import HTML deck*). Its slides become editable, and interactive slide scripts (sliders, tabs, live charts) keep working.

## The visual editor

The editor shows the real presentation. **Hover** over an element to outline it, then **click** it to open the side panel, which shows what can be changed for that element:

- **Text**: double-click to type on the slide. Change the font family, size, weight, italic/underline/uppercase, alignment, line height, letter spacing and color (from theme swatches or a custom color).
- **Box**: fill, padding, spacing, width, border, rounded corners and opacity. Positioned elements can be moved with the arrow keys.
- **Images and logos**: replace an image (upload), fit, size and alt text; set a logo's color.
- **Charts**: edit the data in a grid, change the chart type and number format.
- **Tables**: add or remove rows and columns, highlight the best term.
- **Slides**: background (paper, sand, deep, slate, sage), texture, eyebrow, section number, show or hide the header and footer.
- **Slide list**: add a slide from a layout gallery or from another Excel file, then duplicate, delete or drag to reorder.
- Undo and redo, a *Preview* mode to try interactive elements, version history (the last 50 saves, any of which can be restored), and save-conflict detection.

Every change is written back to the slide markup, so what you see is exactly what's saved, downloaded and shown to clients. An optional *Code* dialog exposes the slide HTML and presentation CSS for power users.

## The theme

The *Theme* page (admins edit, team members view) controls every presentation:

- 16 brand colors and the shell color
- headline and text fonts (the CMAC brand fonts, Google Fonts, or an uploaded font file)
- type scale, weights, letter spacing, uppercase labels, paper texture
- logo, symbol and wordmark artwork
- footer, website and tagline text
- custom CSS

A live preview shows sample slides. Saving the theme updates all presentations immediately, including published ones and charts.

## Architecture

- **Server**: Node.js + Express. `server/`
- **Database**: SQL (SQLite via `better-sqlite3`). The schema is in `server/schema.sql`: companies, users, invites, sessions, themes, presentations, presentation_versions. It uses plain SQL, so moving to Postgres or MySQL only needs type tweaks.
- **Auth**: bcrypt password hashes; random session tokens stored hashed in an httpOnly, SameSite=Lax cookie; an Origin check on writes; rate-limited sign-in and activation.
- **Deck rendering**: `public/deck/builder.js` is shared by the browser and the server. It holds the theme → CSS, the slide layouts, and the document assembly. The deck engine (`cmac.js`) and CSS are the original CMAC library, extracted unchanged except for following theme colors.
- **Isolation**: presentations run in an opaque-origin sandbox (an iframe `sandbox` plus a CSP `sandbox` header), so slide scripts can't act as the signed-in user. The editor talks to the deck only via `postMessage` (`public/deck/editor-agent.js`).
- **Download**: a single self-contained `.html` file (fonts, CSS and scripts inlined) that works offline and prints one slide per page to PDF.
