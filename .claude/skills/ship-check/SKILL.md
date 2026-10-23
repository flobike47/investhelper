---
name: ship-check
description: Porte qualité à passer avant tout commit, push ou PR sur InvestHelper. À utiliser quand une tâche de code est terminée, avant de dire « c'est fait », ou quand l'utilisateur demande de committer / pousser / ouvrir une PR. Attention : un push sur main déploie automatiquement en production sur le Raspberry Pi.
---

# Ship check — avant de livrer

**Contexte critique** : chaque push sur `main` déploie en prod (webhook Portainer). Le CI (`ci.yml`) bloque le déploiement si typecheck, lint, tests ou build échouent — mais il ne voit que ce qui est testé. La relecture ci-dessous reste indispensable.

## 1. Vérifications automatiques (toutes doivent passer)
Lancer depuis la racine et lire la sortie :
```bash
npm run check   # typecheck (tests inclus) + lint + tests + build, comme le CI
```

## 2. Auto-revue du diff
`git diff` (et `git diff --staged`) relu ligne par ligne avec ces questions :
- **Correction** : cas limites (vide, null, 0, très grand, concurrent, Redis down, provider down) ?
- **Sécurité** : entrées validées, `requireUser`, scoping `user_id`, pas de secret dans le code/les logs/le front, pas de nouvelle surface publique non protégée, pas de clé API en query string ?
- **Coût** : nouvel appel Gemini/provider derrière quota + cache ?
- **Contrat** : types front et back alignés ; migration SQL ajoutée si le schéma change, et rétrocompatible ?
- **Config** : nouvelle variable d'env ajoutée partout (`config.ts`/`runtimeConfig.ts`, `.env.example`, `.env.prod.example`, `docker-compose.prod.yml`, entrypoint web) ?
- **Hygiène** : pas de `console.log`, code mort, `TODO` sans contexte, `any`, `as` injustifié, `eslint-disable`, fichier de debug, duplication d'un helper existant.
- **Tests** : la nouvelle logique et chaque bug corrigé ont un test.
- **Portée** : le diff ne contient que ce qui a été demandé.
- **Nouveautés** : un changement visible par l'utilisateur (ajout, correction ressentie, refonte) ⇒ une ligne dans `apps/web/src/constants/releases.ts`, sous l'entrée datée du jour de mise en prod (en créer une si besoin, en tête de liste). Phrase courte, du point de vue de l'utilisateur, sans jargon technique. Les changements invisibles (refactor, tests, infra) n'y vont pas.

## 3. Vérification fonctionnelle
Pour un changement visible : lancer l'app et exercer le parcours (cas nominal + un cas d'erreur). Pour une route : `curl` réel. Dire précisément ce qui a été vérifié et ce qui ne l'a pas été.

## 4. Commit
- Conventional Commits, comme l'historique : `feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `perf:`, `docs:`. Sujet à l'impératif, ≤ 72 caractères ; corps qui explique le **pourquoi**.
- Un commit = une intention. Ne pas mélanger refactor et fix.
- Ne jamais committer `.env*` (hors `*.example`), `dist/`, `*.tsbuildinfo`, `.claude/settings.local.json`.
- Ne pas pousser sur `main` sans accord explicite de l'utilisateur (= déploiement prod). Préférer une branche + PR.

## 5. Compte rendu
Ce qui a changé, comment c'est vérifié (commandes + résultats), ce qui reste non vérifié ou risqué. Si quelque chose a échoué, le dire avec la sortie.
