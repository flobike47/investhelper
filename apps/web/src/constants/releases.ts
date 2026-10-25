/**
 * Notes de mise à jour affichées à l'ouverture de l'app (« Nouveautés »).
 *
 * Rédigées pour l'utilisateur, pas pour le dev : ce qu'il voit ou ressent,
 * en une phrase courte. Une entrée par mise en prod d'un changement visible,
 * datée du jour du déploiement. Du plus récent au plus ancien.
 */

export interface Release {
  /** Date de mise en prod, YYYY-MM-DD (suffixe .2, .3 si plusieurs le même jour). Identifiant trié en chaîne. */
  id: string;
  /** Ajouté */
  added?: string[];
  /** Corrigé */
  fixed?: string[];
  /** Revu */
  improved?: string[];
}

export const RELEASES: Release[] = [
  {
    id: '2026-10-25.2',
    fixed: [
      'Les actions européennes et internationales (Paris, Francfort, Zurich, Londres…) affichent enfin leur cours et leur graphique.',
    ],
    added: [
      'La fiche prévient quand des résultats tombent pendant la durée de détention du plan.',
      'Avec ton capital renseigné dans les réglages, la fiche calcule combien de titres acheter et la perte maximale au stop.',
      'Alertes de prix : une notification quand une action touche son stop, son objectif ou le prix de ton choix.',
    ],
    improved: [
      'La watchlist et les idées se chargent plus vite.',
      'Les idées du moment puisent dans toutes les valeurs suivies (Europe, luxe, ETF), plus seulement dans la tech américaine.',
    ],
  },
  {
    id: '2026-10-25',
    fixed: [
      'En long terme, la tendance et l’historique comparable s’affichent enfin.',
      'Le stop proposé est toujours sous le cours, et la zone d’entrée n’apparaît plus quand le signal est baissier.',
      'Quand il n’y a pas assez d’actualités sur une action, la fiche l’indique au lieu d’afficher « Neutre ».',
    ],
    improved: [
      'Le plan de chaque action propose un stop et un objectif adaptés à sa volatilité, avec le rapport gain/risque.',
      'L’historique comparable précise s’il repose sur trop peu de cas et le compare à l’évolution habituelle de l’action.',
    ],
  },
  {
    id: '2026-10-23.6',
    fixed: ['Sur iPhone, plus aucun flou sous l’heure et la batterie. Pour en profiter : supprime l’app de l’écran d’accueil, puis ajoute-la à nouveau.'],
  },
  {
    id: '2026-10-23.5',
    improved: ['Sur iPhone, la zone de l’heure et de la batterie est unie, sans effet flou.'],
  },
  {
    id: '2026-10-23.4',
    fixed: ['Sur iPhone, les messages de confirmation et la barre de chargement ne passent plus sous l’heure et la batterie.'],
  },
  {
    id: '2026-10-23.3',
    fixed: ['Sur téléphone, la fiche d’une action, les nouveautés et la transcription du podcast se ferment en les tirant vers le bas.'],
  },
  {
    id: '2026-10-23.2',
    fixed: ['Sur iPhone, la barre de navigation est bien collée en bas de l’écran dès l’ouverture de l’app.'],
    improved: ['Sur téléphone, l’app installée s’utilise en mode portrait.'],
  },
  {
    id: '2026-10-23',
    added: [
      'Rappel du podcast : chaque jour à l’heure choisie, ton épisode est préparé et une notification te prévient (Réglages → Notifications).',
      'Bouton « Envoyer un test » pour vérifier que les notifications arrivent bien sur ton appareil.',
      'Ce résumé des nouveautés, affiché après chaque mise à jour et consultable dans Réglages → À propos.',
      'Quand une nouvelle version est en ligne, un bandeau propose de recharger l’app.',
    ],
    fixed: ['Les notifications arrivent désormais aussi sur iPhone.'],
  },
  {
    id: '2026-10-21',
    added: [
      'Nouvelle interface, pensée pour le téléphone comme pour l’ordinateur.',
      'InvestHelper s’installe sur l’écran d’accueil de l’iPhone et s’ouvre en plein écran.',
      'Le podcast continue de jouer quand tu changes de page.',
    ],
    fixed: [
      'Podcast : la durée choisie est respectée et la lecture ne se coupe plus.',
      'Changer un réglage n’écrase plus tes autres préférences.',
      'Les erreurs de chargement de la watchlist s’affichent au lieu d’une liste vide.',
      'Les montants dans une autre devise ne sont plus présentés comme des euros.',
    ],
    improved: [
      'Recherche de symboles plus rapide.',
      'Actualités : une erreur n’affecte plus que son onglet, et les images se chargent au fil du défilement.',
    ],
  },
];
