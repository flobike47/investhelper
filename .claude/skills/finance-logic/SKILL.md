---
name: finance-logic
description: Modifier ou relire la logique financière d'InvestHelper — indicateurs techniques, scoring buy/hold/sell, analogues historiques, playbook, conversion de devises (apps/web/src/lib/indicators.ts, scoring.ts, historicalAnalog.ts, playbook.ts, currency.ts, constants/horizons.ts). À utiliser pour tout calcul sur des prix, des pourcentages, des devises ou des séries temporelles.
---

# Logique financière — exactitude d'abord

Un bug ici ne plante pas l'app : il affiche un **mauvais signal** avec assurance. C'est le pire type de bug pour ce produit. Toute modification de cette zone est accompagnée de tests.

## Principes
1. **Pas de donnée inventée.** Données manquantes → `null` / `'unknown'`, jamais `0` ni une valeur par défaut plausible. Un RSI de 50 « par défaut » est un mensonge.
2. **Fonctions pures.** `lib/` ne dépend ni de React ni du réseau. Entrées et sorties typées, unités explicites dans les noms (`pct` 0-100 vs `ratio` 0-1, `tSec` vs `tMs`).
3. **Gardes numériques.** Division par zéro, `NaN`, `Infinity`, tableaux vides ou plus courts que la période, prix ≤ 0, séries non triées par date, doublons de timestamps. Utiliser `Number.isFinite` avant d'afficher.
4. **Formules de référence.** RSI = Wilder (lissage `(prev*(n-1)+x)/n`), SMA simple, rendement = `(p1 - p0) / p0`. Toute nouvelle formule cite sa source en commentaire et est testée contre des valeurs de référence connues (calculées dans un tableur ou une lib de référence).
5. **Seuils nommés.** Les nombres magiques (`30`, `70`, `1.005`, poids du score) vont dans `constants/` avec leur justification ; ils dépendent de l'horizon (`horizons.ts`).
6. **Score borné et expliqué.** `score ∈ [-100, 100]`, chaque contribution produit une ligne de `rationale` compréhensible. Pas de signal sans explication.

## Devises & arrondis
- Les prix sont des `number` flottants : acceptable pour l'affichage, mais **arrondir uniquement à l'affichage** (`Intl.NumberFormat` avec la devise et la locale `fr-FR`), jamais au milieu d'un calcul.
- Conversion FX : taux daté, direction explicite (`EUR→USD` vs `USD→EUR`), gérer le taux absent (`null`, pas `1`). Ne jamais additionner des montants de devises différentes.
- Les tickers européens (`.PA`, `.AS`…) cotent en EUR, certains en GBp (pence !) sur `.L` — vérifier la devise du profil plutôt que la supposer.

## Temps
- Séries de bougies triées par temps croissant ; vérifier avant calcul.
- Les jours fériés et week-ends créent des trous : un « 20 jours » = 20 bougies, pas 20 jours calendaires.

## Conformité
L'UI présente des **indicateurs**, pas des conseils. Conserver les formulations factuelles (« zone de survente selon le RSI ») et le disclaimer existant ; ne pas introduire de « achetez »/« vendez » impératifs ni de prix cible inventé.

## Tests obligatoires (Vitest, voir skill `testing`)
- Chaque indicateur : série constante, croissante, décroissante, trop courte, avec `NaN`, valeurs de référence connues (`toBeCloseTo`).
- Scoring : table de cas (`it.each`) couvrant chaque branche de vote et les cas `unknown`.
- Property-based (`fast-check`) pour les invariants : RSI ∈ [0, 100], SMA entre min et max de la fenêtre, score ∈ [-100, 100].
