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

Item-Felder: `id`, `title`, `category`, `description`, `availableFrom` (Missions-ID oder `null`), `lostAt` (`{mission, when: "start"|"end"}`), `importance`, `trophy`, `completion100` (`true`/`false`/`"umstritten"`), `confidence`, `note`, `location`, `gtabaseUrl`, `sources`.

Semantik: Ein Eintrag ist sichtbar, sobald `availableFrom` abgeschlossen ist, und muss erledigt sein, bevor die Mission aus `lostAt` abgeschlossen wird. **Rot** = geht mit der nächsten Mission verloren, **Orange** = geht bis zum nächsten Point of no Return verloren.

## Datenstand & Lücken

- Missionsliste (91 Missionen, Prolog + 5 Kapitel): KeenGamer, abgeglichen mit Dexerto. Drei Titel (`Don Gone`, `Starting From Zero`, `The End of the Road`) nennt nur KeenGamer; Dexerto verbirgt sie.
- Kapitel 1 Missables: Startdaten aus dem Projektauftrag, gegen KeenGamer geprüft. TheGamesWiki war beim Prüfen nicht erreichbar (HTTP 429) – offene Punkte sind als „umstritten“ markiert.
- **Reihenfolge `Coming Home`**: laut KeenGamer/Dexerto direkt nach `Feng Shui` (#11, vor `Buck Me`). Das wirkt ungewöhnlich; bitte im Spiel gegenprüfen und bei Abweichung in `missions.json` umsortieren (`order` und Listenposition).
- Missions-Charaktere: nur wo Quellen sie nennen, sonst `unbekannt`.
- Kapitel 2 ff.: nur Missionen, noch keine Missable-Einträge (keine belastbaren Quellen gefunden).
- GTABase-Karte wird nur verlinkt (nicht eingebettet, keine Marker-Daten). Eigene Marker-Links werden im Fortschritt gespeichert.

Fan-Projekt, nicht mit Rockstar Games verbunden.
