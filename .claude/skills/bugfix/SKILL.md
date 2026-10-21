---
name: bugfix
description: Méthode de diagnostic et correction de bug pour InvestHelper. À utiliser dès qu'un utilisateur signale un bug, une erreur en prod, un comportement inattendu, une 500, un podcast tronqué, un signal incohérent, etc.
---

# Corriger un bug — méthode

Objectif : corriger la **cause racine**, une seule fois, avec une preuve, sans en créer d'autres.

## 1. Reproduire
- Obtenir le symptôme exact : message, `reqId` (renvoyé par le BFF dans chaque erreur → retrouver la ligne de log pino), route, user, heure, navigateur.
- Reproduire en local (`npm run redis:up && npm run dev`). Si impossible, l'écrire explicitement plutôt que deviner.
- Distinguer la couche : web (console, onglet Network), BFF (logs, réponse), provider (réponse amont), DB, Redis (clé de cache périmée/corrompue ?). Penser au **cache** : un bug « corrigé » qui persiste vient souvent d'une valeur cachée 6 h / 24 h / 30 j.

## 2. Écrire le test qui échoue
Avant le fix, un test (unitaire ou `app.inject`) qui reproduit le bug et échoue pour la bonne raison. Si l'outillage manque, le mettre en place (skill `testing`).

## 3. Trouver la cause racine
- Demander « pourquoi » jusqu'à la vraie cause : « le script est tronqué » → `MAX_TOKENS` → le thinking consomme le budget → `thinkingBudget` non fixé.
- Lire le code réel, ne pas supposer. Vérifier les hypothèses avec des logs ou un debugger, puis retirer les logs temporaires.
- **Chercher les occurrences sœurs** : le même pattern fautif existe souvent ailleurs (`grep`). Ex. validation dupliquée entre `podcast.ts` et `share.ts`, `timeout: 0` dans plusieurs clients, `error` Supabase non lu dans plusieurs routes. Corriger toutes les occurrences ou les lister explicitement.

## 4. Corriger
- Le plus petit changement qui corrige la cause, pas le symptôme (pas de `try/catch` qui avale, pas de `?? 0` qui masque un `undefined`, pas de `as any`).
- Si la cause est structurelle (duplication, absence de validation), factoriser dans un helper partagé.
- Si des données en cache ou en DB sont corrompues par le bug : prévoir l'invalidation (changer le préfixe/version de clé) ou une migration de correction.

## 5. Prouver
- Le test échoue sans le fix, passe avec.
- `npm run typecheck`, lint et toute la suite de tests passent.
- Vérifier le scénario réel une fois (app lancée, `curl`).

## 6. Rendre compte
Résumer : symptôme → cause racine → fix → preuve (test) → occurrences sœurs traitées ou restantes → risques résiduels. Ne jamais déclarer « corrigé » sans la preuve.
