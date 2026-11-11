# hetcadeaukompas.nl

Volledig statische site. Klaar voor Vercel.

## Uploaden
1. Vercel, New Project, "Deploy without Git" of sleep deze map erin.
2. Framework preset: **Other**. Geen build command, geen output directory.
3. Na de eerste deploy: Settings, Domains, voeg `hetcadeaukompas.nl` toe.
4. Vercel geeft je dan een A-record en een CNAME. Die zet je bij TransIP
   onder DNS-instellingen van het domein.

## Wat zit erin
- `index.html` - de keuzehulp, responsief
- `sinterklaasgedicht/index.html` - de gedichtenmaker, bereikbaar op
  hetcadeaukompas.nl/sinterklaasgedicht
- `producten.json` - de 55 cadeaus. Hier pas je de selectie aan.
- `sitemap.xml`, `robots.txt`, `favicon.svg`, `vercel.json`

## Producten aanpassen
Elk product in producten.json heeft:
  naam, voor, budget, waarom, anders, zoekterm

- `voor` is een van: fijnproever, huis, hem, haar, kind, collega, gamer, alles
- `budget` is 1 (tot 10 euro), 2 (tot 25), 3 (tot 50) of 4 (tot 100)
- `zoekterm` wordt de bol-link. Zet er "GTA6" neer om naar het Gamekompas
  te linken in plaats van naar bol.

Opslaan en opnieuw deployen is genoeg, er hoeft niets gebouwd te worden.

## Affiliate
Alle bol-links gebruiken websitecode **1558352** (Het Cadeau Kompas).

## Bewaarde cadeaus
Die staan in de browser van de bezoeker zelf (localStorage). Geen account,
geen cookie-banner nodig.
