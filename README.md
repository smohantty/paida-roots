# Paida Roots · ପଇଦା

**The families and story of Paida village**, recorded so this knowledge is not lost when our elders are gone.

This repository is the permanent record. It holds a family tree covering the last 4–5 generations (and further back where anyone still remembers), the story of how the village began, and the sources for each fact. The website is built automatically from it.

> ⚠️ The people in `data/` right now are **fictional sample data**, there only to show the format.
> Delete them (`data/people/*`, `data/families/*`) before adding your real family.

## Rules

1. **Never store** phone numbers, Aadhaar, addresses, email, bank, PAN or voter details. The build refuses these fields.
2. **For living people, record the birth year only**, never the full date. The build enforces this too.
3. **Say where each fact came from** (`sources`). "Told by grandmother, 2026" is a good source.
4. **Unsure? Write it down anyway** and mark it `approx: true` or explain in `note`. Something imperfect but recorded is better than something lost.

## How the data is organised

```
data/
  people/P0001.yaml      one file per person
  families/F0001.yaml    one file per couple: partners + children
  places.yaml            villages and towns, referred to by short keys
  sources.yaml           interviews, documents, recordings
stories/                 village history in Markdown (Odia, English, or both)
media/photos/            photos, referred to from a person's `photo:` field
site/                    the website (plain HTML/CSS/JS, no framework)
scripts/build.mjs        checks all data, builds the website and GEDCOM file
```

**Relationships are stored only in family files.** A person file never lists its parents or children. That way each link is recorded in exactly one place and the two can never disagree.

### Add a person

Create `data/people/P0012.yaml`, using the next free number:

```yaml
id: P0012
name:
  en: Full Name In English
  or: ଓଡ଼ିଆରେ ନାମ          # optional
alias: [Nickname]          # optional
gender: M                  # M, F, or U (unknown)
born: { year: 1950, approx: true }
died: { year: 2010 }       # leave out if living; use `deceased: true` if the year is unknown
birthplace: paida          # a key from places.yaml
sahi: Bada Sahi
occupation: Farmer
photo: photos/p0012.jpg    # file inside media/
note: Anything worth remembering about them.
sources: [S001]
```

Then connect them. Add them to `children:` in their parents' family file, and/or create a new family for their marriage:

```yaml
id: F0005
partners: [P0012, P0013]
married: { year: 1975 }
children: [P0014, P0015]
```

### Add a story

Add a Markdown file to `stories/`, e.g. `02-the-great-flood.md`. The first `# Heading` becomes its title, and the number at the front sets its place in the list.

## Commands

You need [Node.js](https://nodejs.org) 20 or newer.

```sh
npm install        # once
npm run check      # check the data for mistakes
npm run serve      # build and open the site at http://localhost:3000
```

`npm run build` writes the site to `dist/`, including `paida-roots.ged`. That is a standard GEDCOM file which opens in Gramps, FamilySearch, Ancestry, MyHeritage and most other family-tree programs.

## Publishing on GitHub Pages

1. Create a repository called `paida-roots` on GitHub and push this folder to it.
2. Go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. Every push to `main` now checks the data and publishes the site at
   `https://<your-username>.github.io/paida-roots/`.

## Keeping it safe for the future

See [HANDOVER.md](HANDOVER.md) for the backup checklist and for how someone else can take over this project.
