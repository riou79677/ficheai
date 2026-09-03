const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';

export default async function handler(req, res) {
  // Same-origin uniquement : pas de CORS ouvert au monde entier.
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    console.error('chat.js : SUPABASE_SERVICE_ROLE_KEY manquante.');
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const { messages, courseContent, language } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }

  // ── Vérification du token Supabase : on récupère l'email depuis le serveur ──
  // On ne fait plus confiance à l'email envoyé par le client.
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Connecte-toi pour utiliser le Chat IA.' });
  }
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
  let email;
  try {
    const authRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token }
    });
    if (!authRes.ok) return res.status(401).json({ error: 'Session invalide, reconnecte-toi.' });
    const authData = await authRes.json();
    email = authData.email;
    if (!email) return res.status(401).json({ error: 'Session invalide.' });
  } catch(e) {
    return res.status(503).json({ error: 'Service momentanément indisponible' });
  }

  // ── Mode maintenance ──
  try {
    const maintRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_maintenance_status', {
      method: 'POST', headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' }, body: '{}'
    });
    const maint = await maintRes.json();
    if (maint && maint.hard_blocked) {
      return res.status(503).json({ error: maint.message || 'FicheAI est en maintenance. On revient très vite !' });
    }
  } catch (e) { /* si la vérification échoue, on laisse passer */ }

  let user;
  try {
    const userRes = await fetch(
      SUPABASE_URL + '/rest/v1/users?email=eq.' + encodeURIComponent(email) + '&select=plan,niveau_scolaire,banned',
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY } }
    );
    const users = await userRes.json();
    user = Array.isArray(users) ? users[0] : null;
    if (user) {
      const banCheck = await fetch(SUPABASE_URL + '/rest/v1/rpc/is_user_banned', {
        method: 'POST', headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_email: email })
      });
      const isBanned = await banCheck.json();
      if (isBanned === true) {
        return res.status(403).json({ error: 'Ce compte a été suspendu. Contacte le support si tu penses qu\'il s\'agit d\'une erreur.' });
      }
    }
  } catch (e) {
    console.error('Erreur lecture profil:', e);
    return res.status(503).json({ error: 'Service momentanément indisponible' });
  }

  if (!user) {
    return res.status(403).json({ error: 'Compte introuvable. Déconnecte-toi puis reconnecte-toi.' });
  }

  try {
    const quotaRes = await fetch(
      SUPABASE_URL + '/rest/v1/rpc/check_and_consume_quota',
      { method: 'POST', headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_email: email, p_type: 'chat' }) }
    );
    const quota = await quotaRes.json();
    if (!quota.allowed) {
      if (quota.reason === 'plan_required') {
        return res.status(403).json({ error: 'Le Chat IA est disponible à partir du plan Pro.' });
      }
      if (quota.reason === 'daily_limit_reached') {
        return res.status(403).json({ error: 'Tu as atteint la limite de messages pour aujourd\'hui. Reviens demain, ou passe à un plan supérieur !' });
      }
      return res.status(403).json({ error: 'Limite de messages atteinte pour ce mois. Passe à un plan supérieur pour continuer !' });
    }
  } catch (e) {
    console.error('Erreur vérification quota chat:', e);
    return res.status(503).json({ error: 'Service momentanément indisponible' });
  }

  const langMap = { fr: 'français', en: 'English', es: 'Español', de: 'Deutsch' };
  const langInstruction = !language || language === 'auto'
    ? 'Réponds dans la même langue que l\'étudiant.'
    : 'Réponds en ' + (langMap[language] || 'français') + '.';

  const niveauMap = {
    college: "L'utilisateur est au COLLÈGE (11-15 ans). Utilise un vocabulaire simple et accessible, des phrases courtes, et des exemples concrets du quotidien. Explique chaque terme technique.",
    lycee: "L'utilisateur est au LYCÉE (15-18 ans), il prépare le baccalauréat. Utilise le vocabulaire attendu au bac et reste rigoureux sans être universitaire.",
    prepa: "L'utilisateur est en CLASSE PRÉPARATOIRE. Niveau d'exigence élevé : rigueur formelle, vocabulaire technique précis, mise en perspective des concepts. Ne simplifie pas.",
    superieur: "L'utilisateur est dans l'ENSEIGNEMENT SUPÉRIEUR. Utilise un vocabulaire académique précis et structure les concepts de façon universitaire."
  };
  const niveauInstruction = niveauMap[user.niveau_scolaire] || niveauMap.lycee;

  const hasCourse = courseContent && String(courseContent).trim().length > 50;
  const courseBlock = hasCourse
    ? '\n\n📚 COURS DE L\'ÉTUDIANT :\n---\n' + String(courseContent).substring(0, 8000) + '\n---'
    : '';

  const ragInstruction = hasCourse
    ? `RÈGLE ABSOLUE : Tu dois baser TOUTES tes réponses exclusivement sur le cours fourni ci-dessus.
- Si la question porte sur un sujet absent du cours, dis-le clairement : "Ce sujet n'est pas abordé dans ton cours. Voici ce que ton cours contient sur un sujet proche : [...]"
- Ne jamais inventer ou compléter avec des connaissances extérieures au cours.
- Cite toujours des éléments précis du cours dans tes réponses.
- Si on te demande de générer une fiche, un quiz ou des flashcards, base-toi uniquement sur le contenu du cours fourni.`
    : `Aucun cours n'a été chargé. Invite gentiment l'étudiant à coller son cours dans la zone de texte et à cliquer sur "Charger le cours" pour que tu puisses l'aider à réviser de façon personnalisée.`;

  const systemPrompt = \`Tu es FicheAI, un tuteur pédagogique expert et bienveillant, spécialisé dans la révision de cours.
\${langInstruction}
\${niveauInstruction}
\${courseBlock}

\${ragInstruction}

Quand tu réponds :
- Structure tes réponses avec des émojis et des titres clairs
- Sois encourageant et précis
- Pour les fiches : utilise des titres, sous-titres, points clés
- Pour les quiz : numérote les questions, donne les réponses après
- Pour les flashcards : format Q: / R: clair\`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages: messages.slice(-12)
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    return res.status(200).json({ result: data.content[0].text });

  } catch (error) {
    console.error('Erreur API chat:', error);
    return res.status(500).json({ error: error.message });
  }
}
