import { sql, type SQL } from 'drizzle-orm';
import { setting } from './identity';

export const DEMO_ISSUER = 'https://saha-demo.example.invalid';
export const DEMO_SCHOOL_ID = 'saha-demo-school';

/** This switch belongs only to a separately provisioned synthetic database.
 * Any school-provider configuration closes the synthetic sign-in path. */
export function demoRuntimeAllowed(): boolean {
  return setting('SAHA_DEMO_ENABLED') === 'true'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(setting('SAHA_DEMO_INSTALLATION_ID'))
    && !['SAHA_OIDC_ISSUER', 'SAHA_OIDC_CLIENT_ID', 'SAHA_OIDC_CLIENT_SECRET', 'SAHA_OIDC_REDIRECT_URL', 'SAHA_OIDC_TOKEN_AUTH_METHOD']
      .some(name => Boolean(setting(name)));
}

/** Include at resolution and actual statement time for synthetic sessions. */
export function demoIdentityScope(identityIssuer: string, schoolId: string): SQL {
  if (identityIssuer !== DEMO_ISSUER) return sql`1`;
  if (!demoRuntimeAllowed() || schoolId !== DEMO_SCHOOL_ID) return sql`0`;
  return sql`exists (select 1 from demo_installations demo_installation
    where demo_installation.id = ${setting('SAHA_DEMO_INSTALLATION_ID')}
      and demo_installation.school_id = ${DEMO_SCHOOL_ID})
    and not exists (select 1 from schools demo_isolation_school
      where demo_isolation_school.id <> ${DEMO_SCHOOL_ID})
    and not exists (select 1 from users demo_isolation_account
      where demo_isolation_account.identity_issuer is null
        or demo_isolation_account.identity_issuer <> ${DEMO_ISSUER}
        or demo_isolation_account.school_id is null
        or demo_isolation_account.school_id <> ${DEMO_SCHOOL_ID})`;
}
