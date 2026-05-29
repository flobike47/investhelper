import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { finnhub } from '@/services/finnhub';
import { yahoo } from '@/services/yahoo';

export function useNextEarnings(symbol: string) {
  const from = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  const to = dayjs().add(120, 'day').format('YYYY-MM-DD');
  return useQuery({
    queryKey: ['earnings', symbol, from, to],
    queryFn: async () => {
      // 1. Yahoo (proxy Worker) — fonctionne quand configuré
      const fromYahoo = await yahoo.nextEarnings(symbol);
      if (fromYahoo) return fromYahoo;

      // 2. Finnhub en fallback (free tier renvoie souvent 403 → null)
      const res = await finnhub.earningsCalendar(symbol, from, to);
      if (!res) return null;
      const today = dayjs().startOf('day');
      const upcoming = res.earningsCalendar
        .filter((e) => dayjs(e.date).isAfter(today.subtract(1, 'day')))
        .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());
      return upcoming[0] ?? null;
    },
    enabled: !!symbol,
    staleTime: 12 * 60 * 60_000,
  });
}
