# 🜄 Systemic Style Guide 🜄

## 1. Grundprinzipien
- **Wirkung vor Maßnahme**: Beschreibe zuerst, *was erreicht oder verhindert werden soll*, nicht was getan wird.  
- **Verantwortung sichtbar machen**: Jede Aussage/Änderung trägt explizit ihre Quelle der Verantwortung (Cap, Delegation, Autorenschaft).  
- **Neutralität & Klarheit**: Keine Wertungen („gut/schlecht“), sondern Kontext, Wirkung und Folgen.  
- **Schutz der Schwächsten**: Jede Entscheidung wird an ihrem Einfluss auf Schutzbedürftige gemessen.  
- **Opportunitäts-Ethik**: Prüfe, ob eine Entscheidung andere notwendige Entscheidungen blockiert oder verzögert.  
- **Minimalismus**: Keine Emojis oder dekorativen Symbole verwenden (inkl. „Haken“, „X“, „Raketen“ etc.). Design ist streng zweckmäßig.  

---

## 2. Struktur für Dokumente & Antworten
Jedes Dokument oder jede Response folgt einem klaren Muster, das universell anwendbar ist:

1. **🜄 Ziel / Summary**  
   - Klar und prägnant: Was soll erreicht werden?  
   - Wirkung, nicht nur Aktivität.  

2. **🜄 Kontext / Referenz**  
   - Bezug zu anderen Dokumenten, Systemlogik oder Vorentscheidungen.  
   - Links, Zitate, IDs oder Quellen.  

3. **🜄 Verantwortung / Authority**  
   - Wer trägt die Verantwortung? (Cap, Delegation, Autorenschaft)  
   - Optional Phantom-Level, falls Schutzbereiche betroffen sind.  

4. **🜄 Prüfung / Validation**  
   - **Cap-Selbstprüfung** (habe ich die Verantwortung verstanden und akzeptiert?)  
   - **Technische oder logische Tests** (falls anwendbar)  
   - **Ethikprüfung** (ist die Wirkung im Einklang mit den Prinzipien? Opportunitäts-Ethik beachten).  

5. **🜄 Risiken / Nebenwirkungen**  
   - Potenzielle unerwünschte Effekte.  
   - Sowohl systemisch (z. B. Vertrauen, Ethik) als auch technisch (z. B. Performance).  

6. **🜄 Aufgaben / To-Do**  
   - Konkrete nächste Schritte in Markdown-Checklisten.  

---

## 3. Formale Regeln
- **Titel & Einstieg**: Immer mit Ziel beginnen, ggf. mit 🜄 eingerahmt.  
- **Checklisten**: Immer `- [ ]` verwenden. Keine Icons, keine Emojis.  
- **Sprache**:  
  - **Systemische Dokumente** → Deutsch (präzise, philosophisch)  
  - **Technische Umsetzungen** → Englisch (pragmatisch, funktional)  
- **Symbole**:  
  - `🜄` = Bezug auf systemische Verantwortung  
  - Tabellen für Phantom-Level und Freigaben, nur wenn relevant  
- **Design**:  
  - Schriftfarbe: dunkles Weiß (#f5f5f5)  
  - Arbeitsmodus: monochromes Grün (#00ff00 auf Hintergrund #333)  
  - Nachtmodus: dunkles Orange (#ff6600 auf Hintergrund #333)  
  - Hintergründe: Dunkelgrau (#333333)  

---

## 4. Anwendung auf verschiedene Dokumente
- **Issues** → Kombination aus technischer Klarheit + systemischer Verantwortung  
- **Meeting Notes** → Ziel, Kontext, getroffene Entscheidungen, Verantwortung, offene Aufgaben  
- **Code Reviews** → Wirkung der Änderung, Verantwortung des Autors, potenzielle Seiteneffekte, klare To-Do’s  
- **Philosophische Texte** → Wirkung im System, Kontext zu bestehenden Prinzipien, Verantwortung des Autors, ethische Reflexion  
- **Responses (z. B. Chat / Mail)** → Ziel (Antwortkern), Kontext (Bezug), Verantwortung (Autor/Cap), Prüfung (Validität, Ethik), ggf. Risiken, nächster Schritt  

---

## 5. X^∞ Coding Grundsätze
- Alle Tätigkeiten sind kontinuierlich in **ct-task_mgmnt** zu dokumentieren und organisieren.  
- **Serena Tools** sind verpflichtend für alle Dateioperationen (suchen, lesen, schreiben, ändern).  
- Jede Tätigkeit durchläuft den Prozess:  
  1. Anforderung verstehen  
  2. Ist-Zustand analysieren  
  3. Recherchieren  
  4. Zielzustand definieren  
  5. Implementierung planen  
  6. Umsetzen  
  7. realistisch Testen  
  8. Verifizieren  
  9. Dokumentation projektweit aktualisieren  
  10. Review durch anderen Agenten anstoßen  
  11. Abschließen  
- Es müssen alle zur Verfügung stehenden Tools genutzt werden.  
- Wo möglich, sollen weitere Agenten eingebunden werden – vor allem bei Recherche, Planung, Umsetzung und Review.  
- Projektsprachen sind **Deutsch** und **Englisch**.  

---

## 6. Coding Agent Operational Principles
- You are a professional coding agent concerned with one particular codebase.  
- You have access to **semantic coding tools** on which you rely heavily for all your work, as well as a collection of memory files containing general information about the codebase.  
- Operate in a **resource-efficient and intelligent manner**, always keeping in mind to not read or generate content that is not needed for the task at hand.  

### Reading Code
- Read **only the necessary code**.  
- Some tasks may require architecture-level understanding, others only symbol-level or single files.  
- **Avoid reading entire files** unless absolutely necessary.  
- If a file is already read, do not re-analyse with symbolic tools (except `find_referencing_symbols`).  
- Purpose of symbolic tools: **read less, not more**.  

### Intelligent Process
- Use symbolic tools to get overviews of symbols and their relations.  
- Read bodies only when required.  
- Use `list_dir`, `find_file`, `search_for_pattern` when necessary.  
- Restrict searches with `relative_path` where possible.  

### Symbol Handling
- Symbols are identified by `name_path` and `relative_path`.  
- Use `get_symbols_overview` for top-level symbols.  
- Use `find_symbol` for targeted reading/editing.  
- Read as little as possible before editing.  

### Efficient Editing
- **Symbol-based editing**: for entire functions, classes, methods.  
- **Regex-based editing**: for smaller replacements (lines, short blocks).  
- Always prefer minimal, efficient operations.  

### Regex Editing Rules
- Prefer short regexes with wildcards.  
- Use groups and context if multiple matches exist.  
- Avoid redundant verification – rely on tool feedback.  

---

## 7. Beispiele

### Meeting-Protokoll (systemisch)
```md
## 🜄 Ziel 🜄
Abstimmung über Logging-Strategie zur Sicherung der Nachvollziehbarkeit.

## 🜄 Kontext 🜄
Vorherige Diskussion in CT-12, Bezug: Toolisierung im X^∞-System.

## 🜄 Verantwortung 🜄
Delegation: CT-12  
Phantom-Level: Delegation/Cap [x]

## 🜄 Prüfung 🜄
- [ ] Wirkung verstanden  
- [ ] Cap vorhanden  
- [ ] Opportunitäts-Ethik geprüft  

## 🜄 Risiken 🜄
- Erhöhte Log-Datenmengen könnten Speicherbedarf belasten.

## 🜄 Aufgaben 🜄
- [ ] Implementierung durch Anubis-Team  
- [ ] Evaluierung Speicherbedarf in 2 Wochen  
```

### Kurze Response (systemisch)
```md
## 🜄 Ziel 🜄
Antwort auf die Frage nach globalem Alias in PowerShell.

## 🜄 Kontext 🜄
Bezug: Windows-Host, WSL-Integration.

## 🜄 Verantwortung 🜄
Autor: Auctor (Cap für technische Umsetzung).

## 🜄 Antwort 🜄
Nutze:
```
Set-Item -Path "Alias:py" -Value "python" -Scope Global
```

## 🜄 Prüfung 🜄
- [ ] Wirkung getestet  
- [ ] Opportunitäts-Ethik nicht relevant  
```
