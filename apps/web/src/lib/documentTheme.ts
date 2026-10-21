/**
 * Synchronise ce qui vit hors de React avec le thème choisi dans l'app :
 *  - <meta name="theme-color"> (barre d'état / chrome du navigateur mobile).
 *    index.html en déclare une par `prefers-color-scheme` pour le premier
 *    rendu ; mais le thème est un choix de l'utilisateur (Réglages), pas
 *    celui de l'OS : on écrit donc la couleur choisie dans TOUTES les metas,
 *    quelle que soit celle que le navigateur retient ;
 *  - `color-scheme` de <html> (scrollbars, contrôles natifs) ;
 *  - le fond de <body> (visible pendant le rebond de scroll iOS) ;
 *  - la variable CSS --ih-color-border-secondary, pour styles.css qui n'a
 *    pas accès aux tokens antd.
 *
 * Renvoie une fonction qui restaure l'état précédent (cleanup d'effet).
 */
export interface DocumentTheme {
  mode: 'dark' | 'light';
  themeColor: string;
  background: string;
  borderSecondary: string;
}

const BORDER_VAR = '--ih-color-border-secondary';

export function applyDocumentTheme(
  { mode, themeColor, background, borderSecondary }: DocumentTheme,
  doc: Document = document,
): () => void {
  const metas = Array.from(doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
  const previousMetas = metas.map((m) => m.content);
  const root = doc.documentElement;
  const previousScheme = root.style.colorScheme;
  const previousBackground = doc.body.style.backgroundColor;
  const previousBorder = root.style.getPropertyValue(BORDER_VAR);

  metas.forEach((m) => {
    m.content = themeColor;
  });
  root.style.colorScheme = mode;
  doc.body.style.backgroundColor = background;
  root.style.setProperty(BORDER_VAR, borderSecondary);

  return () => {
    metas.forEach((m, i) => {
      m.content = previousMetas[i];
    });
    root.style.colorScheme = previousScheme;
    doc.body.style.backgroundColor = previousBackground;
    if (previousBorder) root.style.setProperty(BORDER_VAR, previousBorder);
    else root.style.removeProperty(BORDER_VAR);
  };
}
