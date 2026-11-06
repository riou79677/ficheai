# Bascule TVA de FicheAI

Préparée le 6 novembre 2026. À faire le jour où FicheAI perd la franchise en base de TVA (art. 293 B du CGI).

## Quand

- Seuil de franchise des prestations de services : **37 500 €** de chiffre d'affaires sur l'année civile. S'il est dépassé, la TVA est due à partir du 1er janvier suivant.
- Seuil majoré : **41 250 €**. S'il est dépassé, la TVA est due **dès le jour du dépassement**.
- Seuils à revérifier sur impots.gouv.fr au moment de la bascule.
- Le panneau d'administration affiche le chiffre d'affaires de l'année. La carte passe en orange à partir de 30 000 € : c'est le signal pour lancer cette procédure.

## Ce qui change

| Offre | Sans TVA | Avec TVA (TTC) | Crédits |
|---|---|---|---|
| Pro mensuel | 7,99 € | 8,99 € | 110 |
| Pro annuel | 83,90 € | 101,90 € | 110 par mois |
| Ultimate mensuel | 14,99 € | 18,99 € | 250 |
| Recharge 100 crédits | 6,99 € | 7,99 € | 100 |
| Recharge 300 crédits | 19,99 € | 20,99 € | 300 |
| Recharge 800 crédits | 49,99 € | 53,99 € | 800 |

Marge garantie dans le pire cas (tous les crédits consommés au coût maximum de 0,039 €), après TVA, Stripe et cotisations : Pro > 0,75 €, Ultimate > 1,00 €, recharges > 0,55 €.

Les abonnés déjà inscrits gardent leur ancien prix et leurs crédits (leurs abonnements Stripe restent sur les anciens prix).

## Étapes (une seule session, dans cet ordre)

1. **Numéro de TVA** : le demander au service des impôts des entreprises (espace professionnel impots.gouv.fr) et l'ajouter dans les mentions légales.
2. **Code** : passer `TVA_APPLICABLE = true` dans `api/_tarifs.js` et `var TVA = true` dans `tarifs.js`, mettre à jour la date « Au … » et la version des CGU (`cgu.html` et `CGV_VERSION` dans `api/create-checkout.js`), puis publier.
3. **Base de données** (Supabase, projet qyjqtjrqnlbgtxvnjvnk) :
   `update public.parametres set valeur = 'true', maj = now() where cle = 'tva_applicable';`
4. **Stripe** : renseigner le numéro de TVA dans Paramètres → Informations sur l'entreprise, pour qu'il apparaisse sur les factures.
5. **Vérifier** : page des tarifs, récapitulatif de commande, paiement Stripe (mention « TVA de 20 % incluse »), puis un abonnement test.
6. **Déclarations** : déclarer et payer la TVA collectée (régime de la franchise perdu : déclaration mensuelle, trimestrielle ou annuelle selon le cas, à confirmer avec le service des impôts ou un expert-comptable).

## Où sont les prix

- `api/_tarifs.js` : prix Stripe et montants des paiements (serveur).
- `tarifs.js` : prix affichés sur toutes les pages (`window.FicheTarifs`, éléments `data-prix` et `data-tva`).
- Fonction SQL `plafond_mensuel_eur` : coefficient 0,7295 sans TVA, 0,6015 avec TVA. Les montants 799, 8390, 7990 et 1499 centimes (anciens tarifs) gardent le coefficient sans TVA.
- `api/webhook.js` : crédits des nouveaux prix Stripe, et plafond des recharges via `partNette`.
