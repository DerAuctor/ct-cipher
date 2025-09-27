## 🜄 Ziel 🜄
Konfiguration des MCP Hub als systemctl service zur automatischen Verwaltung und Start des Dienstes. Keine Architektur-Änderungen. Statt pnpm run dev soll die App automatisch per systemctl starten. KISS-Prinzip.

## 🜄 Kontext 🜄
Das Projekt ist ein MCP Hub, basierend auf Node.js/TypeScript, mit Server in src/server.ts. Kein Docker-Deployment verwendet. Sämtliche Datenbanken sind in der Cloud. User möchte nativen systemctl service auf Debian-System.

## 🜄 Verantwortung 🜄
Delegation: User-Anfrage  
Phantom-Level: Delegation/Cap \[ \]

## 🜄 Prüfung 🜄
- \[x\] Wirkung verstanden: Automatische Start/Stop/Restart des MCP Hub Dienstes  
- \[x\] Cap vorhanden: Als Project Manager delegiere ich  
- \[x\] Opportunitäts-Ethik geprüft: Ermöglicht bessere Systemintegration  

## 🜄 Risiken 🜄
- Potenzielle Konflikte mit bestehenden Services  
- Abhängigkeit von Node.js Installation  
- Sicherheit: Service läuft als bestimmter User  

## 🜄 Ist-Zustand Analyse 🜄
Basierend auf Analyse durch debian-sysadmin-xinfty, system-architect und general agent:

**Startup Command:** node dist/src/app/index.js  
**Dependencies:** Cloud-DB Clients (@libsql/client, @qdrant/js-client-rest, ioredis, neo4j-driver, pg), Express, WebSocket, AI SDKs  
**Environment Variables:** 20+ vars including DB_URL, OPENAI_API_KEY, JWT_SECRET, MCPROUTER_API_KEY, PORT, NODE_ENV  
**Working Directory:** /home/auctor/srv/ct-mcphub  
**Production Process:** pnpm run build then pnpm run start  
**Cloud DBs:** Alle DBs in Cloud, keine lokale PostgreSQL

Basierend auf Analyse durch debian-sysadmin-xinfty und system-architect:

**Technologie Stack:**
- Node.js/TypeScript mit ES modules
- Entry Point: dist/index.js
- Package Manager: pnpm
- Datenbank: PostgreSQL erforderlich
- Architektur: Express.js Server mit integriertem React Frontend

**Systemumgebung:**
- Debian mit systemd
- Node.js 24.7.0 verfügbar
- PostgreSQL 17 läuft
- User auctor mit sudo Privilegien

**Aktuelle Deployment Methoden:**
- Container: Dockerfile mit entrypoint.sh
- Development: pnpm dev
- Production: pnpm start oder node dist/index.js

## 🜄 Service Requirements 🜄
- **Service Name:** mcphub.service
- **User:** auctor (bereits vorhanden)
- **Dependencies:** Node.js, network.target
- **Environment Handling:** systemd env files (/etc/systemd/system/mcphub.service.d/env.conf)
- **Working Directory:** /home/auctor/srv/ct-mcphub
- **ExecStart:** node dist/src/app/index.js

## 🜄 Zielzustand Definition 🜄
Empfohlener Ansatz: Direkte systemctl Integration mit User auctor, Sicherheits-Härtung und Cloud-DB Verbindungen.

**Service-Konfiguration:**
- Unit File: /etc/systemd/system/mcphub.service
- User: mcphub (system user)
- Working Directory: /opt/mcphub
- Environment: Production mit DATABASE_URL
- Restart: Always mit 10s Delay
- Security: NoNewPrivileges, PrivateTmp, MemoryLimit

**Abhängigkeiten:**
- PostgreSQL als Required
- Network als After

## 🜄 Tasks Created in ct_dev_task_mgmnt 🜄
12 Tasks erstellt für die Implementierung:
1. Analyze Current Application Setup
2. Define Service Requirements  
3. Document Rollback Procedure
4. Create Dedicated Service User
5. Create systemd Service File
6. Configure Environment Variables
7. Test Service Startup and Shutdown
8. Validate Application Functionality
9. Performance and Resource Testing
10. Enable and Start Production Service
11. Monitor and Verify Production Operation
12. Finalize Rollback Documentation

Gesamtaufwand: 12 Stunden, 1 Entwickler.

## 🜄 Bereit für Freigabe 🜄
Planung abgeschlossen und an User-Feedback angepasst (kein Docker, Cloud-DBs, KISS-Prinzip). Alle Analysen, Reviews und Planung durchgeführt. Tasks in ct_dev_task_mgmnt erstellt und aktualisiert. Warte auf Freigabe durch Auctor für Umsetzung.

## 🜄 Aufgaben 🜄
- \[x\] Ist-Zustand analysieren  
- \[x\] Knowledge Management für Deep Research kontaktieren  
- \[ \] Zielzustand definieren (durch Architekten)  
- \[ \] Peer Review durch Philosophical Reviewer  
- \[ \] Implementierungsplan mit Meilensteinen und Arbeitspaketen erstellen  
- \[ \] Task Management im ct_dev-task_mgmnt durchführen  
- \[ \] Freigabe durch Auctor  
- \[ \] Branch anlegen  
- \[ \] Arbeitspakete umsetzen  
- \[ \] Reviewen lassen  
- \[ \] Syntax Review  
- \[ \] Build und restart  
- \[ \] Realistische Tests  
- \[ \] Gesamt-Review  
- \[ \] Freigabe durch Auctor  
- \[ \] Knowledge Management informieren  
- \[ \] Tasks schließen  
- \[ \] Dokumentation aktualisieren  
- \[ \] Nacharbeit: Test/debug/deprecated files verschieben, löschen  
- \[ \] Changelog und gitignore pflegen  
- \[ \] Commit, Push, PR Erstellung  
- \[ \] Abschlussmeldung


