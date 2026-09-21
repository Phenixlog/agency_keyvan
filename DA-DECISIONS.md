# DA — Journal des décisions

Une ligne par décision **validée par Keyvan**. Méthode : skill `brand-da` (brief → 3 directions → raffinage → brand-board → build).

| Date | Décision |
|---|---|
| 2026-09-21 | Vraie DA sur-mesure (pas d'homogénéisation de l'existant). Papier `#F5F1EA` + teal `#0E5C66` = placeholders Cursor, remplaçables. |
| 2026-09-21 | Audience prioritaire : freelances et petites agences (multi-marques, exigeants visuellement). |
| 2026-09-21 | Émotion cible en 3 s : « atelier vivant » — chaleureux, tactile, en cours de fabrication. |
| 2026-09-21 | Anti-modèle : les dashboards IA (dégradés violets, étincelles, promesse magique interchangeable). |
| 2026-09-21 | Contraintes : aucun logo existant (à créer) · mode clair uniquement · le nom « Brand OS » est un nom de travail, la DA ne repose pas dessus. |
| 2026-09-21 | Références fournies par Keyvan : 5 dashboards « bento » (conteneur flottant arrondi sur fond teinté, nav en pilules ou rail d'icônes, noir + 1 accent, grands rayons, surfaces tonales sans ombre, une carte héros accent). Le brief est amendé : la grammaire du cadre vient de là ; « l'atelier vivant » passe par le contenu (créations épinglées, versions, règles apprises), pas par de la texture. |
| 2026-09-21 | **Direction retenue : A · Cimaise**, avec les métadonnées en mono de B · Établi (versions, formats, dates). Pierre chaude `#E4E0D6`, coque `#F6F4EE`, encre `#1A1815`, Instrument Serif + Instrument Sans + JetBrains Mono, rayons 24/32, pilules noires. |
| 2026-09-21 | Pas de brand-board ni de série d'assets générés : la DA est « tout en typo et aplats », les images sont celles des clients. Les tokens sont la référence (`lib/tokens.ts` ↔ `app/globals.css`, parité et contrastes AA testés). |
| 2026-09-21 | Symbole : un cadre accroché à son clou, indépendant du nom du produit ; le cadre prend la couleur de la marque cliente active. |

## Règles de la DA
- Aucune carte sans donnée réelle : pas de faux KPI. Le héros est la marque cliente et ses images.
- Dispositif signature : l'unique case « accent » d'un écran (`BrandCard`) prend la couleur de la **marque cliente active** ; le cadre reste neutre. Une seule `BrandCard` par écran.
- La couleur cliente n'est jamais une couleur de texte : aplat, teinte (`bg-tint`) ou surligneur (`.highlighter`) uniquement. Le texte sur l'aplat est encre ou blanc selon la luminance, et l'aplat est foncé de quelques % si aucun des deux n'atteint AA (`brandSurface`).
- Les zones se séparent par le ton des surfaces (scene → shell → card → soft), pas par des ombres ni des bordures. Deux ombres seulement : `lift` (survol) et `float` (flottant).
- Titres en sérif, interface en sans, et tout ce qui est version / format / date en mono (`Meta`, `VersionTag`, `Tag`).
- Un seul motif : les hachures, réservées à l'aplat de couleur cliente.
- Icônes Lucide, trait 1,75, 18 px. Jamais d'emoji.
