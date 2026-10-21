/**
 * Faux client Supabase en mémoire — couvre le sous-ensemble du query builder
 * utilisé par les routes (select/eq/order/limit/insert/delete/maybeSingle/single).
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

  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let op: 'select' | 'insert' | 'delete' = 'select';
    let pending: Row | null = null;
    const match = (r: Row) => filters.every(([k, v]) => r[k] === v);

    async function exec(single: boolean) {
      tables[table] ??= [];
      if (op === 'insert') {
        const row: Row = { created_at: new Date().toISOString(), expires_at: null, ...pending };
        tables[table].push(row);
        return { data: row, error: null };
      }
      if (op === 'delete') {
        tables[table] = tables[table].filter((r) => !match(r));
        return { data: null, error: null };
      }
      const rows = tables[table].filter(match);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }

    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return builder;
      },
      insert: (row: Row) => {
        op = 'insert';
        pending = row;
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
    rows(table: string): Row[] {
      return tables[table] ?? [];
    },
  };
}

export const auth = (token: keyof typeof TOKENS) => ({ authorization: `Bearer ${token}` });
