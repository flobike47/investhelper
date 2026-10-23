import { useState } from 'react';
import { RELEASES } from '@/constants/releases';
import { latestReleaseId, unseenReleases } from '@/lib/releaseNotes';
import { useAuth } from '@/lib/auth';
import { useLocalSettings } from '@/store/localSettings';

/**
 * Notes « Nouveautés » pas encore vues sur cet appareil. Calculées une fois
 * au montage : la note reste affichée jusqu'à sa fermeture, même si l'heure
 * ou le compte changent entre-temps.
 */
export function useReleaseNotes() {
  const { user } = useAuth();
  const setLastSeen = useLocalSettings((s) => s.setLastSeenRelease);
  const [releases] = useState(() =>
    user
      ? unseenReleases(RELEASES, {
          lastSeenId: useLocalSettings.getState().lastSeenRelease,
          accountCreatedAt: user.created_at,
          now: new Date(),
        })
      : [],
  );
  const [open, setOpen] = useState(releases.length > 0);

  /** Toute fermeture vaut lecture : sinon la note reviendrait à chaque lancement. */
  const dismiss = () => {
    const latest = latestReleaseId(RELEASES);
    if (latest) setLastSeen(latest);
    setOpen(false);
  };

  return { releases, open, dismiss };
}
