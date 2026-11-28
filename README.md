# GTA 6 Story-Checkliste

Private Web-App (PWA, offline nutzbar), die zeigt, was du **vor der nächsten Story-Mission** noch erledigen solltest – Missables, Points of no Return und Nebenmissionen. Kein Zugriff auf Spielstände; der Fortschritt ist die zuletzt gespielte Mission, die du selbst setzt.

Statisch (HTML/CSS/JS, kein Build, keine Laufzeit-Abhängigkeiten). Fortschritt liegt im `localStorage`, Sicherung als JSON oder Übertragung per Link/QR-Code unter „Mehr“.

## Aufbau der App

| Reiter | Inhalt |
| --- | --- |
| **Jetzt** | Nächste Mission mit Bild und Kurzbeschreibung, „Mission gespielt – weiter“, „Im Spiel schon weiter?“, Aufgaben, die vorher erledigt sein müssen, Warnungen vor Points of no Return |
| **Story** | Alle 109 Story-Einträge nach Kapiteln (inkl. kleiner Story-Aufgaben), Suche deutsch/englisch, eigene Seite je Mission mit „Spiele ich gerade“ |
| **Neben** | 74 Nebenmissionen (optional, Fremde & Freaks) nach Kapitel, Filter, Suche |
| **Fundorte** | Alle Orte der GTABase-Karte (über 6.500), filterbar nach Gebiet (Geheimnisse, einzigartige Waffen, besondere Fahrzeuge, Sammelobjekte, Karten, Aktivitäten …) nach Art gruppiert, mit Filter, Suche, Abhaken und Direktlink auf den Marker der Live-Karte |
| **Mehr** | Alle Aufgaben, Trophäen & 100 %, Geld-Rechner, Übertragen, Sicherung, Spoiler-Schutz |

Spoiler-Schutz: Alles nach der aktuellen Mission ist ausgeblendet („Noch 11 Missionen in diesem Kapitel – anzeigen“).

Bedienung: Aufgabe nach rechts wischen = erledigt, nach links = Details. Jede Änderung lässt sich über die Meldungsleiste rückgängig machen.

## Lokal starten

```
npm start      # http://localhost:8080
npm test       # Logik- und Daten-Tests (Node 20+)
```

Alternativ jeder Static-Server im Projektordner. Direkt per `file://` geht nicht (ES-Module, `fetch`).

## Dateien

- `app.js` – Oberfläche (DOM wird nur über `h()`/Textknoten gebaut, kein `innerHTML`)
- `logic.js` – reine Logik (Fortschritt, Dringlichkeit, Geld-Rechner, Teilen), getestet in `test/logic.test.mjs`
- `art.js` – eigene Illustrationen als SVG: bewegte Kulissen (Key Lento, Port Gellhorn, Vice City) und Bilder je Mission
- `icons.js` – Linien-Icons (aus Lucide, ISC-Lizenz)
- `sw.js` – Offline-Cache. Nach Änderungen an Dateien in `SHELL` die Konstante `CACHE` hochzählen, damit Handys die neue Version laden
- `vendor/` – Schriften Inter und Barlow Condensed (SIL OFL 1.1, siehe `vendor/fonts/LICENSE-fonts.txt`), qrcode-generator 1.4.4 (MIT), Lucide-Lizenz
- `icons/` – App-Symbol (`icon.svg`, PNGs per `node icons/make-icons.mjs`, braucht Playwright) und Logo für die Kopfzeile

Vorschaubilder werden beim ersten Anzeigen aus dem SVG in kleine PNGs umgerechnet und im Browser-Cache `gta6-thumbs-v1` abgelegt; ein neuer Service Worker löscht sie, sodass geänderte Zeichnungen neu entstehen.

## Hosting über GitHub Pages

1. Branch `main` pushen.
2. **Settings → Pages → Build and deployment**: Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)`.
3. Nach ~1 Minute erreichbar unter `https://<user>.github.io/<repo>/`.
4. Am Handy öffnen → „Zum Startbildschirm hinzufügen“ → läuft als App, auch offline.

## Daten

- `data/missions.json` – Story in GTABase-Reihenfolge: `id`, `name` (englisch), `nameDe`, `chapter`, `character`, `order`, `step` (kleine Story-Aufgabe), `pointOfNoReturn`, `ponrNote`, `desc` (deutsche Kurzbeschreibung, spoilerarm), `art`
- `data/sidemissions.json` – Nebenmissionen: `id`, `name`, `nameDe`, `kind` (`optional` | `stranger`), `giver`, `chapter`, `after` (Story-Mission, nach der sie erscheint), `missable`, `description`, `url`, `item` (verknüpfte Aufgabe), `art`
- `data/items.json` – Aufgaben/Missables: `id`, `title`, `category`, `description`, `availableFrom`, `lostAt` (`{mission, when: "start"|"end"}`), `importance`, `trophy`, `completion100` (`true`/`false`/`"umstritten"`), `confidence`, `note`, `location`, `gtabaseUrl` (Marker-Link `https://www.gtabase.com/de/gta-6/karte/#<marker-id>`), `mapFeature`, `sources`
- `data/chapters.json` – Kapitelnamen
- `data/spots.json` – Fundorte: Gruppen, Gebiete (`regions`), Ortsnamen (`places`) und Kategorien mit Einträgen `[markerId, name, gebiet, ort (-1 = keiner), foto (1/0)]`. Erzeugt mit `node tools/fetch-spots.cjs` (Playwright) aus der GTABase-Karte: Gebiete werden aus deren Landkreis-Grenzen bestimmt (Mariana County geteilt in Leonida Keys und Grassrivers), der Ort ist der nächste Ortsname im Umkreis. Übernommen werden nur ID, Name, Kategorie, Gebiet/Ort und ob es ein Foto gibt – Beschreibungen und Fotos bleiben auf GTABase (deren Bilder dürfen nicht eingebettet werden). Link: `https://www.gtabase.com/de/gta-6/karte/#<markerId>`. Gefundene Orte stehen im Fortschritt unter `found` und werden im Teilen-Link als Bitfeld je ID-Präfix übertragen.

`art` beschreibt das Bild: `{ loc, motif, time }` mit `loc` ∈ keys, swamp, gellhorn, vice, beach, country; `time` ∈ dusk, day, night; `motif` ist ein Motiv aus `art.js` (z. B. `car`, `motel`, `pills`, `bank`). Die Tests prüfen, dass jedes Motiv existiert.

Semantik: Eine Aufgabe ist sichtbar, sobald `availableFrom` gespielt ist, und muss erledigt sein, bevor die Mission aus `lostAt` startet bzw. endet. Rot markiert = geht mit der nächsten Mission verloren, lila = geht bis zum nächsten Point of no Return verloren.

## Datenstand & Lücken (Stand 25.11.2026)

- Story-Reihenfolge, deutsche Titel und Nebenmissionen nach GTABase (Missionslog). Deutsche Titel sind dort teils maschinell übersetzt; offensichtliche Fehlübersetzungen sind korrigiert.
- Points of no Return: Touristenfalle (Kap. 1), Auschecken (Kap. 2), Sonnenuntergang (Kap. 4), Unerledigte Angelegenheiten (Kap. 5, laut GTABase).
- Missables: KeenGamer, Gamerant, Output Lag, game-checklists, vicemissions, Everyblip. Widersprüchliche Einträge sind als „unsicher“ markiert, mit Notiz; eine wöchentliche Aufgabe prüft sie nach.
- Einträge mit `lostAt: null` haben keinen festen Verlustpunkt: sie bleiben offen und werden nie rot.
- GTABase-Karte wird nur verlinkt. Eigene Marker-Links stehen im Fortschritt.
- Bilder: eigene Zeichnungen, keine Spielgrafiken. Logo: eigene „VI“-Bildschirm-Gestaltung.

Fan-Projekt, nicht mit Rockstar Games verbunden.
