# Rapid Pare-Brise CRM — sauvegarde et restauration PostgreSQL

## Sauvegarde automatique

Le workflow `.github/workflows/database-backup.yml` s'exécute le 1er de chaque mois et peut aussi être lancé manuellement depuis GitHub Actions.

Il :
1. crée un dump PostgreSQL au format custom avec `pg_dump` ;
2. vérifie que le dump est lisible par `pg_restore` ;
3. chiffre le dump avec AES-256-CBC + PBKDF2 (200000 itérations) ;
4. publie uniquement le fichier chiffré et son SHA-256 dans une GitHub Release.

Aucun mot de passe de base de données ni contenu en clair n'est publié dans la Release.

## Secrets GitHub requis

Dans Settings > Secrets and variables > Actions :

- `DATABASE_URL` : chaîne de connexion PostgreSQL Neon de production.
- `BACKUP_ENCRYPTION_KEY` : secret de chiffrement fort d'au moins 32 caractères, distinct du mot de passe CRM et du `CRM_SESSION_SECRET`.

Ne jamais committer ces valeurs dans le dépôt et ne jamais les envoyer dans un chat.

## Test initial

Après avoir ajouté les deux secrets, ouvrir Actions > Encrypted PostgreSQL backup > Run workflow. Le run doit terminer en vert et créer une Release contenant :

- `rapid-pb-<run-id>.dump.enc`
- `rapid-pb-<run-id>.sha256`

## Restauration

1. Télécharger le `.dump.enc` et le `.sha256` depuis la Release choisie.
2. Vérifier le SHA-256 avec `sha256sum -c <fichier>.sha256`.
3. Déchiffrer :

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in rapid-pb-<run-id>.dump.enc \
  -out rapid-pb.restore.dump \
  -pass env:BACKUP_ENCRYPTION_KEY
```

4. Restaurer d'abord dans une base PostgreSQL vide de test, jamais directement sur la production :

```bash
pg_restore --no-owner --no-acl --clean --if-exists \
  --dbname="$RESTORE_DATABASE_URL" rapid-pb.restore.dump
```

5. Contrôler prospects, particuliers, événements et documents avant toute bascule de production.

## Règles de sécurité

- Conserver `BACKUP_ENCRYPTION_KEY` hors du dépôt GitHub.
- Ne jamais publier un dump non chiffré.
- Tester périodiquement une restauration sur une base isolée.
- Neon reste la base active ; les Releases sont une copie de secours indépendante de Neon.
