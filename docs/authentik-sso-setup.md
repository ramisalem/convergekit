# Workforce SSO with Authentik

Colab Ai Hub's workforce SSO is a standard SAML 2.0 service provider, and
[Authentik](https://github.com/goauthentik/authentik) is the supported identity
provider. This guide walks through connecting the two.

When workforce SSO is enabled, email/password sign-in is disabled and the
sign-in page shows a single "Continue with Authentik" button (the label comes
from `WORKFORCE_SSO_PROVIDER_LABEL`).

SAML here is front-channel only: the browser is redirected to Authentik and
posts the assertion back. The API never calls Authentik directly, so Authentik
only has to be reachable from your users' browsers — not from the API container.

## How the pieces map

| Colab Ai Hub (service provider) | Authentik (identity provider)         |
| ------------------------------- | ------------------------------------- |
| `WORKFORCE_SAML_SP_ENTITY_ID`   | Provider → Audience                   |
| `WORKFORCE_SAML_ACS_URL`        | Provider → ACS URL                    |
| `WORKFORCE_SAML_IDP_SSO_URL`    | Provider → SSO URL (Redirect binding) |
| `WORKFORCE_SAML_IDP_ENTITY_ID`  | Provider → Issuer                     |
| `WORKFORCE_SAML_IDP_CERT`       | Provider → Signing certificate (PEM)  |

Authentik's **Issuer** and **Audience** are two different fields and must not be
given the same value: Issuer identifies Authentik (`WORKFORCE_SAML_IDP_ENTITY_ID`),
Audience identifies this app (`WORKFORCE_SAML_SP_ENTITY_ID`).

The SP endpoints served by the API:

- Metadata: `https://<your-host>/api/auth/workforce-saml/metadata`
- Login (SP-initiated): `https://<your-host>/api/auth/workforce-saml/login`
- Assertion Consumer Service (POST): `https://<your-host>/api/auth/workforce-saml/acs`

## 1. Create the application and provider in Authentik

1. In the Authentik admin UI, go to **Applications → Providers → Create** and
   choose **SAML Provider**.
2. Configure the provider:
   - **Name**: `Colab Ai Hub`
   - **Authorization flow**: your usual implicit/explicit consent flow
   - **ACS URL**: `https://<your-host>/api/auth/workforce-saml/acs`
   - **Issuer**: an explicit issuer for this provider, e.g.
     `https://authentik.example.com`. (If you leave Authentik's default, the
     issuer is the provider metadata URL — either way,
     `WORKFORCE_SAML_IDP_ENTITY_ID` must be set to this exact value.)
   - **Service Provider Binding**: `Post`
   - **Audience**: the SP entity ID, e.g. `urn:convergekit:dev` (must equal
     `WORKFORCE_SAML_SP_ENTITY_ID`)
3. Under **Advanced protocol settings**:
   - **Signing certificate**: select a certificate (e.g. the built-in
     `authentik Self-signed Certificate`) so assertions are signed.
   - **Property mappings**: keep the default `authentik default SAML mappings`
     (UPN, name, email, username, groups). The email mapping is what the account
     is keyed on — see [Which value becomes the account email](#which-value-becomes-the-account-email).
   - **NameID Property Mapping**: **Email** is the cleanest choice, but the
     default hashed user ID and the UPN mapping both work too.
4. Create an **Application** (Applications → Applications → Create), e.g. slug
   `colab-ai-hub`, and set its **Provider** to the one you just created.

Alternatively, import the SP metadata from
`https://<your-host>/api/auth/workforce-saml/metadata` when creating the
provider instead of typing the ACS URL and audience by hand.

### Which value becomes the account email

The account is keyed on the **email attribute** from the assertion, checked in
this order:

1. `email`
2. `mail`
3. `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` (what
   Authentik's default mappings emit)
4. `urn:oid:0.9.2342.19200300.100.1.3`

The NameID is used only when the assertion carries no email attribute at all,
and then it must itself be an email address. This is deliberate: Authentik's UPN
NameID mapping emits something like `user@corp.internal`, which looks like an
email but is not the address the account should use — and would be rejected
outright when `ACCESS_ALLOWED_EMAIL_DOMAIN` is set. Keep the default property
mappings and the email attribute is always present.

If neither is usable, the ACS returns `401 SAML_SIGN_IN_FAILED` with
`SAML response did not contain a resolvable email identity`.

## 2. Collect the IdP values

From **Applications → Providers → Colab Ai Hub**:

- **SSO URL (Redirect)** — shown on the provider overview, shaped like
  `https://authentik.example.com/application/saml/colab-ai-hub/sso/binding/redirect/`
- **Issuer** — copy the exact value configured on the provider
- **Signing certificate** — download the certificate you selected
  (System → Certificates → download the PEM)

## 3. Configure Colab Ai Hub

Set the environment variables on the API runtime and restart it:

```bash
WORKFORCE_SSO_ENABLED=true
WORKFORCE_SSO_PROVIDER_LABEL=Authentik
WORKFORCE_SAML_IDP_SSO_URL=https://authentik.example.com/application/saml/colab-ai-hub/sso/binding/redirect/
WORKFORCE_SAML_IDP_ENTITY_ID=https://authentik.example.com
WORKFORCE_SAML_IDP_CERT="-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----"
WORKFORCE_SAML_SP_ENTITY_ID=urn:convergekit:dev
WORKFORCE_SAML_ACS_URL=https://<your-host>/api/auth/workforce-saml/acs
WORKFORCE_SAML_START_URL=https://<your-host>/en/auth/sign-in
INITIAL_ADMIN_EMAIL=you@example.com
```

Notes:

- **Put the certificate on one line.** In a `.env` file consumed by Docker
  Compose, a real multi-line PEM breaks parsing. Use a single double-quoted line
  with literal `\n` separators (as above) — those are unescaped at load time.
  Concatenated PEM blocks and comma-separated cert bodies are also accepted, so
  you can list the old and new certificate during a rollover.
- Once `WORKFORCE_SSO_ENABLED=true`, five values are required —
  `WORKFORCE_SAML_IDP_SSO_URL`, `WORKFORCE_SAML_IDP_ENTITY_ID`,
  `WORKFORCE_SAML_IDP_CERT`, `WORKFORCE_SAML_SP_ENTITY_ID`, and
  `WORKFORCE_SAML_ACS_URL` — and the API refuses to start with a partial
  configuration. `WORKFORCE_SAML_START_URL` is optional.
- **The first admin cannot come from Authentik.** Until one admin exists, every SSO
  sign-in is refused with `bootstrap_admin_required`. Bootstrap it through GitHub
  first: set `INITIAL_ADMIN_EMAIL` plus a working `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`,
  open the sign-in page's **Admin** tab, and sign in with the GitHub account whose
  email matches. Admins stay GitHub-linked by design — `requireAuth` demands a GitHub
  access token for every admin, because admins index repositories through GitHub.
  Once that admin exists, Authentik users are auto-provisioned as regular members.
- If `ACCESS_ALLOWED_EMAIL_DOMAIN` is set, only Authentik users whose email
  matches that domain can sign in — including the bootstrap admin.
- Serve the app over HTTPS. Session cookies are issued with `Secure` when
  `NODE_ENV=production`, so sign-in cannot complete over plain HTTP.

## 4. Verify

1. Open `https://<your-host>/en/auth/sign-in` — you should see
   **Continue with Authentik**.
2. Click it: you are redirected to Authentik, authenticate, and land back in
   Colab Ai Hub signed in.
3. Confirm email/password sign-in is refused (the API returns
   `EMAIL_SIGN_IN_DISABLED` for `POST /api/auth/sign-in/email`).

Failures are logged by the API as `auth.saml.denied` with the reason, and
returned to the browser as `401 SAML_SIGN_IN_FAILED`:

| Message                                         | Cause                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `did not contain a resolvable email identity`   | No email attribute and a non-email NameID — check property mappings  |
| `SAML email must use the … domain`              | Email is outside `ACCESS_ALLOWED_EMAIL_DOMAIN`                       |
| `SAML sign-in denied: bootstrap_admin_required` | No admin yet and the email is not `INITIAL_ADMIN_EMAIL`              |
| `SAML sign-in denied: user_deactivated`         | The account exists but was deactivated                               |
| `SAML assertion has expired`                    | Clock skew between Authentik and the API host                        |
| Signature / issuer errors                       | `WORKFORCE_SAML_IDP_CERT` or `WORKFORCE_SAML_IDP_ENTITY_ID` mismatch |

## Running Authentik with Docker Compose

`compose.authentik.yaml` in the repository root runs Authentik next to the app
stack. It is opt-in — nothing in the default stack references it. It brings its
own PostgreSQL and shares the stack's Redis on a separate logical database.

```bash
# .env — generate the secret first: openssl rand -base64 48
AUTHENTIK_SECRET_KEY=...
AUTHENTIK_PORT=9000

# Optional: seed the `akadmin` account on first boot instead of clicking through
# the setup flow. The token is an API token you can drive Authentik's REST API with.
AUTHENTIK_BOOTSTRAP_EMAIL=admin@example.com
AUTHENTIK_BOOTSTRAP_PASSWORD=...
AUTHENTIK_BOOTSTRAP_TOKEN=...

make authentik:up          # or: docker compose -f compose.yaml -f compose.authentik.yaml up -d
```

Then:

1. Sign in as `akadmin` at `http://localhost:9000`, or create the first admin at
   `http://localhost:9000/if/flow/initial-setup/` if you skipped the bootstrap
   variables.
2. Follow steps 1–3 above, with
   `WORKFORCE_SAML_IDP_SSO_URL=http://localhost:9000/application/saml/colab-ai-hub/sso/binding/redirect/`
   and `WORKFORCE_SAML_IDP_ENTITY_ID=http://localhost:9000`.
3. Restart the API so it picks up the new environment
   (`make compose:prod` re-creates it).

`WORKFORCE_SAML_ACS_URL` and `WORKFORCE_SAML_START_URL` must always use the host
the **browser** reaches the app on (e.g. `https://convergekit-dev.local`), never
a container hostname.

To run a self-managed Authentik instead, see the
[Authentik installation docs](https://docs.goauthentik.io/docs/install-config/install/docker-compose);
only the `WORKFORCE_SAML_IDP_*` values change.
