# GTA 6 Story-Checkliste

Private Web-App (PWA, offline nutzbar), die zeigt, was du **vor der nächsten Story-Mission** noch erledigen solltest – Missables und Points of no Return. Kein Zugriff auf Spielstände; der Fortschritt ist die zuletzt abgeschlossene Mission, die du selbst setzt.

Statisch (HTML/CSS/JS, keine Abhängigkeiten, kein Build). Fortschritt liegt im `localStorage`, Export/Import als JSON unter „Mehr“.

## Lokal starten

```
npm start      # http://localhost:8080
npm test       # Logik-Tests (Node 20+)
```

Alternativ jeder beliebige Static-Server im Projektordner. Direkt per `file://` geht nicht (ES-Module, `fetch`).

## Hosting über GitHub Pages

1. Repo auf GitHub, Branch `main` pushen.
2. **Settings → Pages → Build and deployment**: Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)`.
3. Nach ~1 Minute erreichbar unter `https://<user>.github.io/<repo>/`.
4. Am Handy öffnen → „Zum Startbildschirm hinzufügen“ → läuft als App, auch offline.

Hinweis: Das Repo sollte **privat** bleiben, die Pages-Seite ist aber öffentlich erreichbar, wenn Pages aktiv ist (bei Privatrepos nur mit bezahltem Plan). Die App enthält keine persönlichen Daten – der Fortschritt bleibt im Browser. Nach Änderungen an Dateien in `SHELL` (`sw.js`) die Konstante `CACHE` hochzählen, damit Handys die neue Version laden.

## Daten erweitern

Spieldaten liegen getrennt von der Logik:

- `data/missions.json` – geordnete Missionsliste (`id`, `name`, `chapter`, `character`, `order`, `pointOfNoReturn`, `ponrNote`)
- `data/items.json` – Einträge (siehe Felder unten)
- `data/chapters.json` – Kapitelnamen

Item-Felder: `id`, `title`, `category`, `description`, `availableFrom` (Missions-ID oder `null`), `lostAt` (`{mission, when: "start"|"end"}`), `importance`, `trophy`, `completion100` (`true`/`false`/`"umstritten"`), `confidence`, `note`, `location`, `gtabaseUrl` (Marker-Link `https://www.gtabase.com/de/gta-6/karte/#<marker-id>`), `mapFeature` (optional: GTABase-Kategorie, z. B. `ammu-nation`, wenn kein genauer Marker bekannt ist), `sources`.

Semantik: Ein Eintrag ist sichtbar, sobald `availableFrom` abgeschlossen ist, und muss erledigt sein, bevor die Mission aus `lostAt` abgeschlossen wird. **Rot** = geht mit der nächsten Mission verloren, **Orange** = geht bis zum nächsten Point of no Return verloren.

## Datenstand & Lücken (Stand 23.11.2026)

- Missionsliste (91 Missionen, Prolog + 5 Kapitel): KeenGamer, abgeglichen mit Dexerto. Drei Titel (Don Gone, Starting From Zero, The End of the Road) nennt nur KeenGamer.
- Missables: Kapitel 1 aus KeenGamer, Gamerant, Output Lag; Kapitel 2-5 aus game-checklists, vicemissions und Everyblip. Metaforge (403), Game8 (402) und TheGamesWiki (429) ließen sich nicht lesen.
- Points of no Return: Tourist Trap (Kap. 1), Checking Out (Kap. 2), Sunset (Kap. 4). Für Kapitel 5 uneinig (siehe Eintrag Save vor den letzten Missionen), daher nur als Eintrag, nicht als Banner.
- Reihenfolge Coming Home: laut KeenGamer/Dexerto direkt nach Feng Shui (vor Buck Me). Bitte im Spiel gegenprüfen und bei Abweichung in missions.json umsortieren.
- Einträge mit lostAt: null haben keinen festen Verlustpunkt (zeitlich begrenzte Missionen, unklare Quellen): sie bleiben offen und werden nie rot/orange.
- Viele Einträge sind nur durch eine Quelle gestützt oder in Guides widersprüchlich: sie sind als umstritten markiert, mit Notiz.
- Nicht aufgenommen, weil unbestätigt: Thrillbillies-Hinweis, Arthur-Morgan-Hut, Pfister Growler, Mandys Mietjob in Pipework.
- Missions-Charaktere: nur wo Quellen sie nennen, sonst unbekannt.
- GTABase-Karte wird nur verlinkt. Eigene Marker-Links stehen im Fortschritt.
- Wischen: Aufgabe nach rechts = erledigt, nach links = Details. Jede Änderung lässt sich über die Meldungsleiste rückgängig machen.
- „Mehr“: Fortschritt per Link/QR-Code auf ein anderes Gerät übertragen (`#import=…`, mit Rückfrage), Geld-Rechner für das Ende von Kapitel 1.
- `vendor/qrcode.js`: qrcode-generator 1.4.4 (MIT, Kazuhiko Arase), als ES-Modul verpackt.

Fan-Projekt, nicht mit Rockstar Games verbunden.
