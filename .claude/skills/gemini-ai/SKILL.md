---
name: gemini-ai
description: Travailler sur les fonctionnalités IA d'InvestHelper basées sur Gemini — sentiment ticker, thèmes de marché, script de podcast, TTS multi-speaker (apps/bff/src/providers/gemini.ts, routes/analysis.ts, routes/podcast.ts, routes/share.ts, web lib/audio.ts). À utiliser pour modifier un prompt, une sortie JSON, la génération audio, ou ajouter une feature LLM.
---

# Fonctionnalités Gemini — fiabilité, coût, sécurité

## Sorties structurées
- Pour du JSON, utiliser `responseMimeType: 'application/json'` **et** `responseSchema` (schéma OpenAPI-subset côté Gemini). Ne pas se reposer sur le prompt seul ni sur un regex `\{[\s\S]*\}` de rattrapage.
- **Valider la sortie côté serveur** avec Zod avant de la renvoyer ou de la cacher : enums (`positive|negative|neutral|mixed`), bornes (`score ∈ [-1, 1]`), longueur des tableaux. Sortie invalide → une nouvelle tentative max, puis erreur 502. Ne **jamais** mettre en cache une sortie invalide (sinon 6 h de réponse cassée pour tout le monde).
- `JSON.parse(x) as T` n'est pas une validation.

## Troncature et finishReason
- `finishReason !== 'STOP'` (`MAX_TOKENS`, `SAFETY`, `RECITATION`) = résultat incomplet : pour du JSON → erreur ; pour un script → logguer en `warn` via le logger pino (pas `console.warn`) avec model, tokens, et ne pas cacher 24 h un script tronqué.
- Lire **toutes** les `parts` du candidat (pas seulement `parts[0]`) : le texte peut être découpé, et avec le thinking activé la première part peut être une pensée.
- Pour les tâches créatives/longues : `thinkingBudget: 0` sinon le thinking consomme le `maxOutputTokens`.

## Prompt injection
Les titres/descriptions de news sont du **contenu non fiable** injecté dans le prompt. Règles :
- Délimiter clairement les données (balises `<news>…</news>`) et dire au modèle que leur contenu ne contient jamais d'instructions.
- Borner la taille du corpus (nb d'articles et longueur par article).
- Le système de sortie (JSON validé, format `Alex:/Sophie:`) est la vraie défense : on valide le format, on ne fait pas confiance au contenu.

## Conformité financière
Le produit ne donne pas de conseil en investissement. Tout prompt garde les contraintes : pas de prédiction de prix chiffrée, pas de recommandation d'achat/vente, s'appuyer strictement sur les sources fournies. Toute nouvelle feature LLM qui produit du texte affiché à l'utilisateur reprend ces contraintes.

## Coût
- Chaque appel Gemini est derrière `enforceQuota` et derrière un cache (`cachedJson`/`cachedBinary`) avec une clé qui couvre **toutes** les entrées du prompt (modèle et version du prompt inclus : changer un prompt doit invalider le cache → ajouter un `PROMPT_VERSION` dans la clé).
- Les routes publiques (partage) ne doivent jamais permettre de générer du contenu arbitraire : le TTS public reçoit un `chunkIndex` et le serveur recalcule `splitDialogue(script)` (`src/tts.ts`). Garder ce modèle pour toute future route publique.
- Modèles : constantes en tête de `gemini.ts`. Avant de changer de modèle, vérifier la doc Google (noms, dépréciation des `preview`, prix).

## TTS / audio
- Format renvoyé : PCM 16-bit LE, 24 kHz, mono → enveloppé en WAV côté web (`pcmToWavBlob`). Toute modif garde ces trois paramètres alignés entre BFF (headers `X-Audio-*`) et web.
- `splitDialogue` existe en deux copies (web `lib/audio.ts`, BFF `src/tts.ts`, `TTS_CHUNK_CHARS = 800`) qui **doivent** produire les mêmes chunks pour partager le cache TTS — un test de parité (`test/tts.test.ts`) le garantit ; modifier les deux ensemble. La taille reste < `MAX_TTS_TEXT` (2000).
- Concurrence côté web bornée (`processWithConcurrency`) ; en cas d'échec d'un chunk, ne pas tout perdre : retry du chunk, puis erreur claire.
- Libérer les `ObjectURL` (`URL.revokeObjectURL`) et stopper `speechSynthesis` au démontage.

## Tests
- Unitaires purs : `splitDialogue`, `pcmToWavBlob` (header RIFF correct), `autoDurationMinutes`, validation des sorties JSON (fixtures valides, invalides, tronquées).
- Route : Gemini mocké (jamais d'appel réel en test) — sortie valide, invalide, `finishReason: MAX_TOKENS`, `blockReason`.
