# Security Policy

## Supported Versions

Security fixes are provided for the latest released version on the `master` branch (and corresponding GitHub Release). Please upgrade to the latest version before reporting a vulnerability.

| Version | Supported |
| :--- | :--- |
| Latest release (`master`) | Yes |
| Older releases | No |

## Reporting a Vulnerability

**Please do not report security vulnerabilities in public GitHub Issues or Discussions.**

If you discover a security vulnerability in KISS Translator, please report it privately through one of the following channels:

1. **GitHub Security Advisories (Preferred)**: Open a private vulnerability report via the repository's **Security → Advisories → Report a vulnerability** page.
2. **Email**: Send details to [yugang2002@gmail.com](mailto:yugang2002@gmail.com) with the subject prefix `[Security]`.

To help us investigate quickly, please include:

- Affected platform and version (e.g., Chrome/Edge/Firefox extension, Userscript, or Web build)
- A clear description of the vulnerability and potential impact
- Minimal reproduction steps or a proof-of-concept
- Any suggested mitigation if you have one

We will acknowledge receipt as soon as possible and coordinate disclosure once a fix is ready.

## Security Boundaries & Scope

KISS Translator runs across browser extensions (MV3), userscripts, and web pages. The following areas are in scope for security reports:

- **Extension Privilege & Messaging Isolation**: Cross-origin or page-to-extension message spoofing between webpage scripts, `content.js`, `web_accessible_resources`, `fileBridge.js`, and `background.js`.
- **Provider Plugin Sandbox & Network Scope**: Bypasses of declared plugin network allowlists (`src/providers/packageNetwork.js`, `src/providers/originRules.js`) or script worker isolation (`src/providers/scriptWorker.js`). Note that external plugin authorization is intentionally device-local and not synced across devices.
- **Credentials, Sync Encryption & Privacy**: Unauthorized exposure of stored API keys, weaknesses in encrypted sync (`src/libs/syncCrypto.js`), or credential leakage in diagnostic log exports (`src/libs/diagnostics/privacy.js`).
- **File Bridge Isolation**: Leaking extension credentials or privileged capabilities to web pages via `src/fileBridge.js`.
- **HTML/DOM Injection & XSS**: Untrusted content escaping sanitization (`dompurify`, `src/libs/trustedTypes.js`) during webpage, subtitle, or document/EPUB/PDF rendering.

## Out of Scope

The following are generally outside the scope of this repository's security policy:

- Vulnerabilities in third-party translation/AI API providers or self-hosted endpoints configured by the user
- Cross-origin access explicitly granted by the user in a third-party userscript manager (e.g., Tampermonkey / Violentmonkey)
- Issues requiring physical access to an unlocked device or a previously compromised browser profile
- Official or third-party provider plugin packages maintained outside this repository (for official plugins, report in [fishjar/kiss-translator-plugins](https://github.com/fishjar/kiss-translator-plugins))
