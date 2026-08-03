# Workforce SSO with Authentik

Colab Ai Hub's workforce SSO is a standard SAML 2.0 service provider, and
[Authentik](https://github.com/goauthentik/authentik) is the supported identity
provider. This guide walks through connecting the two.

When workforce SSO is enabled, email/password sign-in is disabled and the
sign-in page shows a single "Continue with Authentik" button (the label comes
from `WORKFORCE_SSO_PROVIDER_LABEL`).

## How the pieces map

| Colab Ai Hub (service provider)                       | Authentik (identity provider)               |
| ----------------------------------------------------- | ------------------------------------------- |
| `WORKFORCE_SAML_SP_ENTITY_ID`                          | Provider → Issuer/Audience restriction      |
| `WORKFORCE_SAML_ACS_URL`                               | Provider → ACS URL                          |
| `WORKFORCE_SAML_IDP_SSO_URL`                           | Provider → SSO URL (Redirect binding)       |
| `WORKFORCE_SAML_IDP_ENTITY_ID`                         | Provider → Issuer                           |
| `WORKFORCE_SAML_IDP_CERT`                              | Provider → Signing certificate (PEM)        |

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
   - **Issuer**: your Authentik base URL, e.g. `https://authentik.example.com`
   - **Service Provider Binding**: `Post`
   - **Audience**: the SP entity ID, e.g. `urn:convergekit:dev` (must equal
     `WORKFORCE_SAML_SP_ENTITY_ID`)
3. Under **Advanced protocol settings**:
   - **Signing certificate**: select a certificate (e.g. the built-in
     `authentik Self-signed Certificate`) so assertions are signed.
   - **Property mappings**: keep the default `authentik default SAML mappings`
     (UPN, name, email, username, groups).
   - **NameID Property Mapping**: choose the **Email** mapping so the NameID is
     the user's email address. (If you leave the default hashed user ID,
     sign-in still works — Colab Ai Hub falls back to the email attribute from
     the default mappings.)
4. Create an **Application** (Applications → Applications → Create), e.g. slug
   `colab-ai-hub`, and set its **Provider** to the one you just created.

Alternatively, import the SP metadata from
`https://<your-host>/api/auth/workforce-saml/metadata` when creating the
provider instead of typing the ACS URL and audience by hand.

## 2. Collect the IdP values

From **Applications → Providers → Colab Ai Hub**:

- **SSO URL (Redirect)** — shown on the provider overview, shaped like
  `https://authentik.example.com/application/saml/colab-ai-hub/sso/binding/redirect/`
- **Issuer** — as configured above
- **Signing certificate** — download the certificate you selected
  (System → Certificates → download the PEM)

## 3. Configure Colab Ai Hub

Set the environment variables on the API runtime and restart it:

```bash
WORKFORCE_SSO_ENABLED=true
WORKFORCE_SSO_PROVIDER_LABEL=Authentik
WORKFORCE_SAML_IDP_SSO_URL=https://authentik.example.com/application/saml/colab-ai-hub/sso/binding/redirect/
WORKFORCE_SAML_IDP_ENTITY_ID=https://authentik.example.com
WORKFORCE_SAML_IDP_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
WORKFORCE_SAML_SP_ENTITY_ID=urn:convergekit:dev
WORKFORCE_SAML_ACS_URL=https://<your-host>/api/auth/workforce-saml/acs
WORKFORCE_SAML_START_URL=https://<your-host>/en/auth/sign-in
```

Notes:

- `WORKFORCE_SAML_IDP_CERT` accepts a full PEM block (escaped `\n` is fine in
  env files), several concatenated PEM blocks, or comma-separated cert bodies —
  useful during certificate rollover.
- All `WORKFORCE_SAML_*` values are required once `WORKFORCE_SSO_ENABLED=true`;
  the API refuses to start with a partial configuration.
- If `ACCESS_ALLOWED_EMAIL_DOMAIN` is set, only Authentik users whose email
  matches that domain can sign in.

## 4. Verify

1. Open `https://<your-host>/en/auth/sign-in` — you should see
   **Continue with Authentik**.
2. Click it: you are redirected to Authentik, authenticate, and land back in
   Colab Ai Hub signed in.
3. Confirm email/password sign-in is refused (the API returns
   `EMAIL_SIGN_IN_DISABLED` for `POST /api/auth/sign-in/email`).

## Running Authentik locally

For local development, run Authentik with its official Docker Compose stack
(see the [Authentik installation docs](https://docs.goauthentik.io/docs/install-config/install/docker-compose))
alongside the Colab Ai Hub dev stack, then point the `WORKFORCE_SAML_*`
variables at `http://localhost:9000` (Authentik's default port). Remember the
ACS and start URLs must use the host the browser reaches the app on
(e.g. `https://convergekit-dev.local`).
