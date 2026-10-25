/**
 * Faux client Supabase en mémoire — couvre le sous-ensemble du query builder
 * utilisé par les routes et les jobs (select/eq/or/order/limit/insert/upsert/
 * update/delete/maybeSingle/single, count en head).
 * Les filtres `.eq()` sont réellement appliqués : un test d'isolation entre
 * users échoue si une route oublie de filtrer sur user_id.
 */
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';
export const TOKENS: Record<string, string> = { 'token-a': USER_A, 'token-b': USER_B };

export function createSupabaseFake() {
  let tables: Tables = {};
  /** Erreur Postgres à renvoyer à la prochaine écriture sur une table (simule un trigger, une contrainte). */
  const nextError: Record<string, { code: string; message: string; details?: string } | undefined> = {};

  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'insert' | 'delete' | 'update' | 'upsert' = 'select';
    let pending: Row | Row[] | null = null;
    let window: [number, number] | null = null;
    let onConflict: string[] = [];
    let ignoreDuplicates = false;
    let countOnly = false;
    const match = (r: Row) => filters.every((f) => f(r));

    /** Sous-ensemble de la syntaxe PostgREST de `.or()` : `col.is.null`, `col.lt.v`, `col.eq.v`. */
    function orFilter(expr: string) {
      const conds = expr.split(',').map((c) => {
        const [col, operator, ...rest] = c.split('.');
        const value = rest.join('.');
        return (r: Row) => {
          const v = r[col] ?? null;
          if (operator === 'is' && value === 'null') return v === null;
          if (operator === 'lt') return v !== null && String(v) < value;
          if (operator === 'eq') return String(v) === value;
          throw new Error(`fake supabase : opérateur .or() non géré (${c})`);
        };
      });
      return (r: Row) => conds.some((f) => f(r));
    }

    async function exec(single: boolean) {
      tables[table] ??= [];
      const injected = nextError[table];
      if (injected && op !== 'select') {
        nextError[table] = undefined;
        return { data: null, error: injected };
      }
      if (op === 'insert') {
        const rows = (Array.isArray(pending) ? pending : [pending]).map((p) => ({
          created_at: new Date().toISOString(),
          expires_at: null,
          ...p,
        }));
        tables[table].push(...rows);
        return { data: Array.isArray(pending) ? rows : rows[0], error: null };
      }
      if (op === 'upsert') {
        for (const one of Array.isArray(pending) ? pending : [pending]) {
          // Comme supabase-js : les clés undefined ne sont pas envoyées
          const patch = Object.fromEntries(Object.entries(one ?? {}).filter(([, v]) => v !== undefined));
          const existing = tables[table].find((r) => onConflict.every((k) => r[k] === patch[k]));
          if (existing && !ignoreDuplicates) Object.assign(existing, patch);
          else if (!existing) tables[table].push({ created_at: new Date().toISOString(), ...patch });
        }
        return { data: null, error: null };
      }
      if (op === 'update') {
        const rows = tables[table].filter(match);
        rows.forEach((r) => Object.assign(r, pending as Row));
        return { data: single ? (rows[0] ?? null) : rows, error: null };
      }
      if (op === 'delete') {
        // Comme `.delete().select()` : renvoie les lignes supprimées
        const removed = tables[table].filter(match);
        tables[table] = tables[table].filter((r) => !match(r));
        return { data: single ? (removed[0] ?? null) : removed, error: null };
      }
      const all = tables[table].filter(match);
      const rows = window ? all.slice(window[0], window[1] + 1) : all;
      if (countOnly) return { data: null, count: all.length, error: null };
      return { data: single ? (rows[0] ?? null) : rows, count: rows.length, error: null };
    }

    const builder = {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) countOnly = true;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      range: (from: number, to: number) => {
        window = [from, to];
        return builder;
      },
      eq: (k: string, v: unknown) => {
        filters.push((r) => r[k] === v);
        return builder;
      },
      or: (expr: string) => {
        filters.push(orFilter(expr));
        return builder;
      },
      insert: (row: Row | Row[]) => {
        op = 'insert';
        pending = row;
        return builder;
      },
      upsert: (row: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        op = 'upsert';
        pending = row;
        onConflict = (opts?.onConflict ?? 'id').split(',');
        ignoreDuplicates = opts?.ignoreDuplicates ?? false;
        return builder;
      },
      update: (patch: Row) => {
        op = 'update';
        pending = patch;
        return builder;
      },
      delete: () => {
        op = 'delete';
        return builder;
      },
      maybeSingle: () => exec(true),
      single: () => exec(true),
      then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
        exec(false).then(onOk, onErr),
    };
    return builder;
  }

  return {
    from,
    auth: {
      getUser: async (token: string) => {
        const id = TOKENS[token];
        return id
          ? { data: { user: { id, email: `${id}@test`, role: 'authenticated' } }, error: null }
          : { data: { user: null }, error: { message: 'invalid', code: 'bad_jwt', status: 401 } };
      },
    },
    seed(next: Tables) {
      tables = structuredClone(next);
    },
    failNextWrite(table: string, error: { code: string; message: string; details?: string }) {
      nextError[table] = error;
    },
    rows(table: string): Row[] {
      return tables[table] ?? [];
    },
  };
}

export const auth = (token: keyof typeof TOKENS) => ({ authorization: `Bearer ${token}` });
