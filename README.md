# FicheAI

Application web de révision pour lycéens et étudiants, propulsée par l'IA. Génère des fiches de révision, des quiz et propose un chat IA pour approfondir un cours.

## Stack technique

- **Frontend** : HTML / CSS / JavaScript vanilla
- **Backend / Auth / Base de données** : Supabase
- **Paiements** : Stripe (abonnements Pro et Ultimate, mensuel et annuel)
- **IA** : Claude API (Anthropic)
- **Hébergement** : Vercel

## Fonctionnalités principales

- Génération de fiches de révision à partir de cours (texte ou photo)
- Mode Chat IA pour poser des questions sur un cours (plans Pro / Ultimate uniquement)
- Export PDF des fiches
- Gestion d'abonnement via Stripe Customer Portal
- Interface adaptative selon le plan de l'utilisateur (Free / Pro / Ultimate)

## Structure du projet

```
├── index.html          # Page d'accueil
├── login.html           # Connexion
├── signup.html          # Inscription
├── app.html             # Application principale (génération de fiches, Chat IA)
├── app.js               # Logique de l'application principale
├── dashboard.html        # Tableau de bord utilisateur
├── settings.html         # Paramètres et gestion d'abonnement
├── confirmation.html      # Page de confirmation post-paiement
├── style.css            # Styles globaux
├── api/                 # Endpoints backend (appels sécurisés à l'API Claude, etc.)
├── vercel.json           # Configuration de déploiement Vercel
└── package.json
```

## Déploiement

Le projet est déployé sur Vercel. Chaque push sur la branche `main` déclenche un déploiement automatique.

Variables d'environnement nécessaires (à configurer dans Vercel > Settings > Environment Variables) :
- Clé API Claude (Anthropic)
- Clés Supabase (URL du projet + clé publique)
- Clés Stripe (clé secrète + clé publique + secret webhook)

## État du projet

- Authentification et gestion de compte : fonctionnel
- Paiements Stripe (4 plans, webhook, Customer Portal) : fonctionnel
- Génération de fiches et Chat IA : fonctionnel
- Export PDF : fonctionnel
- En cours : finalisation légale (CGU, politique de confidentialité) et enregistrement en auto-entrepreneur

## Licence

Projet privé — tous droits réservés.
