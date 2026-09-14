# Rapid Pare-Brise CRM — SaaS V2.2

Cette archive est **le projet SaaS**, pas un prototype HTML à ouvrir par double-clic.

## Socle technique V2.2

- Next.js 16.3.5 (Active LTS) + React 19.3.0
- Prisma ORM 7.10.0 + client PostgreSQL `@prisma/adapter-pg`
- PostgreSQL 17 pour le développement local
- TypeScript 5.9.3
- PWA installable avec mise à jour automatique du service worker
- Dependabot + CI de contrôle des dépendances, audit, typecheck et build
- Sessions HTTP-only signées, mots de passe scrypt avec sel individuel + pepper, autorisation par propriétaire
- Documents privés, audit, automatisations et contrôle d'origine sur mutations

## Démarrage Windows

1. Installer Node.js 22.x (ou une LTS compatible) et Docker Desktop.
2. Copier `.env.local.example` vers `.env.local`.
3. Modifier `SESSION_SECRET`, `PASSWORD_PEPPER`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET` et `SEED_ADMIN_PASSWORD`.
4. Double-cliquer `start-dev.bat`.
5. Le script installe les dépendances, démarre PostgreSQL, génère Prisma, initialise la base et lance Next.js.
6. Ouvrir `http://localhost:3000`.

Le compte de démonstration est créé par le seed avec l'e-mail `samir@rapid-pare-brise.local`. Le mot de passe est celui de `SEED_ADMIN_PASSWORD`.

## Fonctionnalités

- Accueil / Mode Centre
- Prospection avec filtres et fiche entreprise
- Pipeline complet
- Terrain adaptatif et éligibilité stricte des établissements vérifiés/accessibles
- Partenaires
- Performance décisionnelle avec KPI et graphiques
- Messages
- Documents avec upload privé
- PWA installable
- Authentification et autorisation par propriétaire
- Audit et automatisations
- PostgreSQL + Prisma 7

## Sécurité des documents

Le dépôt GitHub est actuellement public. Les PDF privés du CRM ne sont donc volontairement **pas publiés dans ce dépôt**. Ils devront être placés dans un stockage privé lors du déploiement, conformément aux règles de sécurité du projet.

## Vérification

Après installation :

- `npm run typecheck`
- `npm run build`
- `npm run audit`
- `npm run check`

## Production

Voir `SECURITY.md`. Avant toute donnée client réelle, utiliser PostgreSQL managé chiffré, stockage objet privé, sauvegardes testées, rate-limit distribué, MFA, gestionnaire de secrets, monitoring, tests d'autorisation et audit de sécurité.
